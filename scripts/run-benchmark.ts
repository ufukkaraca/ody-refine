/**
 * Benchmark runner: loads the contradiction corpus, runs all three
 * detection approaches, and reports precision/recall/F1 with gate evaluation.
 *
 * Usage: npx tsx scripts/run-benchmark.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  KnowledgeNode,
  LLMProvider,
  ChatMessage,
  LLMCompletionOptions,
} from '../packages/core/src/types.js';
import {
  computeMetrics,
  evaluateGate,
  runCurrentPipeline,
  runRawLlm,
  runAugmented,
} from '../packages/detectors/src/benchmark.js';
import type {
  GroundTruthEntry,
  BenchmarkCorpus,
  BenchmarkResult,
} from '../packages/detectors/src/benchmark.js';

// --- Load corpus ---

interface RawNode {
  id: string;
  pairId: string;
  title: string;
  content: {
    summary: string;
    facts: string[];
    entities: Array<{ name: string; type: string }>;
    raw: string;
  };
  confidence: number;
}

interface RawGroundTruth {
  pairs: Array<{
    id: string;
    category: string;
    hasContradiction: boolean;
    docA: string;
    docB: string;
    expectedFinding: { type: string; minSeverity: string; description: string } | null;
  }>;
}

function loadCorpus(): BenchmarkCorpus {
  const fixtureDir = resolve(
    import.meta.dirname ?? '.',
    '../packages/eval/fixtures/contradiction-corpus',
  );

  const rawNodes: RawNode[] = JSON.parse(
    readFileSync(resolve(fixtureDir, 'nodes.json'), 'utf-8'),
  );
  const rawGt: RawGroundTruth = JSON.parse(
    readFileSync(resolve(fixtureDir, 'ground-truth.json'), 'utf-8'),
  );

  // Hydrate nodes to full KnowledgeNode shape
  const nodes: KnowledgeNode[] = rawNodes.map((rn) => ({
    id: rn.id,
    title: rn.title,
    content: {
      summary: rn.content.summary,
      facts: rn.content.facts,
      entities: rn.content.entities,
      source: { sourceType: 'fixture', sourceId: rn.id },
      raw: rn.content.raw,
    },
    embedding: [],
    embeddingModel: 'none',
    embeddingDim: 0,
    confidence: rn.confidence,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  // Map pairId → [nodeIdA, nodeIdB]
  const pairNodes = new Map<string, string[]>();
  for (const rn of rawNodes) {
    const existing = pairNodes.get(rn.pairId) ?? [];
    existing.push(rn.id);
    pairNodes.set(rn.pairId, existing);
  }

  // Build ground truth entries using node IDs
  const groundTruth: GroundTruthEntry[] = rawGt.pairs.map((p) => {
    const nodeIds = pairNodes.get(p.id) ?? [];
    return {
      nodeIdA: nodeIds[0] ?? '',
      nodeIdB: nodeIds[1] ?? '',
      isContradiction: p.hasContradiction,
      topic: p.expectedFinding?.description,
    };
  });

  return { nodes, edges: [], groundTruth };
}

// --- OpenRouter LLM Provider ---

function createOpenRouterProvider(apiKey: string): LLMProvider {
  const model = process.env['OPENROUTER_MODEL'] ?? 'anthropic/claude-3.5-haiku';

  return {
    async complete(
      messages: ChatMessage[],
      options?: LLMCompletionOptions,
    ): Promise<string> {
      const body = {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0,
        max_tokens: options?.maxTokens ?? 1024,
      };

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OpenRouter ${resp.status}: ${text}`);
      }

      const data = (await resp.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0]?.message?.content ?? '';
    },

    async *stream(): AsyncGenerator<string, void, unknown> {
      throw new Error('Streaming not implemented for benchmark');
    },

    getModelId(): string {
      return model;
    },
  };
}

// --- Run benchmark ---

function formatResult(r: BenchmarkResult): string {
  return [
    `  ${r.approach}:`,
    `    Precision: ${(r.precision * 100).toFixed(1)}%`,
    `    Recall:    ${(r.recall * 100).toFixed(1)}%`,
    `    F1:        ${(r.f1 * 100).toFixed(1)}%`,
    `    Detections: ${r.detections.length} (${r.durationMs}ms)`,
  ].join('\n');
}

async function main(): Promise<void> {
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY required. Set it in your environment.');
    process.exit(1);
  }

  console.log('Loading corpus...');
  const corpus = loadCorpus();
  console.log(
    `Corpus: ${corpus.nodes.length} nodes, ${corpus.groundTruth.length} pairs ` +
    `(${corpus.groundTruth.filter((g) => g.isContradiction).length} positive, ` +
    `${corpus.groundTruth.filter((g) => !g.isContradiction).length} negative)`,
  );

  const llm = createOpenRouterProvider(apiKey);
  console.log(`LLM: ${llm.getModelId()}\n`);

  // Approach A: Current pipeline (heuristic only)
  console.log('Running approach A: current pipeline (heuristic only)...');
  const startA = Date.now();
  const detectionsA = await runCurrentPipeline(corpus);
  const metricsA = computeMetrics(detectionsA, corpus.groundTruth);
  const resultA: BenchmarkResult = {
    approach: 'current-pipeline',
    ...metricsA,
    detections: detectionsA,
    durationMs: Date.now() - startA,
  };
  console.log(formatResult(resultA));

  // Approach B: Raw LLM (full pipeline with LLM)
  console.log('\nRunning approach B: raw LLM (full pipeline with LLM)...');
  const startB = Date.now();
  const detectionsB = await runRawLlm(corpus, llm);
  const metricsB = computeMetrics(detectionsB, corpus.groundTruth);
  const resultB: BenchmarkResult = {
    approach: 'raw-llm',
    ...metricsB,
    detections: detectionsB,
    durationMs: Date.now() - startB,
  };
  console.log(formatResult(resultB));

  // Approach C: LLM-augmented (heuristic + context packages + chain-of-thought)
  console.log('\nRunning approach C: LLM-augmented...');
  const startC = Date.now();
  const detectionsC = await runAugmented(corpus, llm);
  const metricsC = computeMetrics(detectionsC, corpus.groundTruth);
  const resultC: BenchmarkResult = {
    approach: 'llm-augmented',
    ...metricsC,
    detections: detectionsC,
    durationMs: Date.now() - startC,
  };
  console.log(formatResult(resultC));

  // Gate evaluation
  const results = [resultA, resultB, resultC];
  const { passesGate, gateDetails } = evaluateGate(results);

  console.log('\n' + '='.repeat(60));
  console.log('BENCHMARK GATE');
  console.log('='.repeat(60));
  console.log(gateDetails);
  console.log(`\nResult: ${passesGate ? 'PASS' : 'FAIL'}`);
  console.log('='.repeat(60));

  // Detail view: which contradictions each approach found
  console.log('\nDetection detail:');
  for (const gt of corpus.groundTruth.filter((g) => g.isContradiction)) {
    const foundA = detectionsA.some(
      (d) => d.type === 'contradiction' &&
        d.nodeIds.includes(gt.nodeIdA) && d.nodeIds.includes(gt.nodeIdB),
    );
    const foundB = detectionsB.some(
      (d) => d.type === 'contradiction' &&
        d.nodeIds.includes(gt.nodeIdA) && d.nodeIds.includes(gt.nodeIdB),
    );
    const foundC = detectionsC.some(
      (d) => d.type === 'contradiction' &&
        d.nodeIds.includes(gt.nodeIdA) && d.nodeIds.includes(gt.nodeIdB),
    );
    const label = gt.topic ?? `${gt.nodeIdA} vs ${gt.nodeIdB}`;
    console.log(
      `  ${foundA ? 'A' : '.'}${foundB ? 'B' : '.'}${foundC ? 'C' : '.'} ${label}`,
    );
  }

  process.exit(passesGate ? 0 : 1);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(2);
});
