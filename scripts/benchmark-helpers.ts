/**
 * Benchmark helper utilities: corpus loading, LLM provider factory,
 * markdown formatting, and intermediate result persistence.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  KnowledgeNode,
  LLMProvider,
  ChatMessage,
  LLMCompletionOptions,
} from '../packages/core/src/types.js';
import type {
  GroundTruthEntry,
  BenchmarkCorpus,
  BenchmarkReport,
} from '../packages/detectors/src/benchmark.js';

export const DEFAULT_MODELS = [
  'ollama/llama3',
  'anthropic/claude-3-haiku',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-opus-4-6',
  'openai/gpt-4o',
];

/** Result of running the full benchmark suite for one model. */
export interface ModelRunResult {
  model: string;
  report: BenchmarkReport;
  completedAt: string;
}

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
    expectedFinding: {
      type: string;
      minSeverity: string;
      description: string;
    } | null;
  }>;
}

/** Load the contradiction corpus from eval fixtures. */
export function loadCorpus(baseDir: string): BenchmarkCorpus {
  const fixtureDir = resolve(
    baseDir,
    'packages/eval/fixtures/contradiction-corpus',
  );

  const rawNodes: RawNode[] = JSON.parse(
    readFileSync(resolve(fixtureDir, 'nodes.json'), 'utf-8'),
  );
  const rawGt: RawGroundTruth = JSON.parse(
    readFileSync(resolve(fixtureDir, 'ground-truth.json'), 'utf-8'),
  );

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

  const pairNodes = new Map<string, string[]>();
  for (const rn of rawNodes) {
    const existing = pairNodes.get(rn.pairId) ?? [];
    existing.push(rn.id);
    pairNodes.set(rn.pairId, existing);
  }

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

/** Create an OpenRouter LLM provider for a specific model. */
export function createOpenRouterProvider(
  apiKey: string,
  model: string,
): LLMProvider {
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

      const resp = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
      );

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

/** Parse --models CLI flag or BENCHMARK_MODELS env var. */
export function parseModels(): string[] {
  const flag = process.argv.find((a) => a.startsWith('--models='));
  if (flag) {
    return flag.split('=')[1]!.split(',').map((m) => m.trim());
  }
  const env = process.env['BENCHMARK_MODELS'];
  if (env) {
    return env.split(',').map((m) => m.trim());
  }
  return DEFAULT_MODELS;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Format benchmark results as a publishable markdown comparison table. */
export function formatMarkdownTable(runs: ModelRunResult[]): string {
  const lines: string[] = [
    '## Benchmark Results',
    '',
    '| Model | Approach | Precision | Recall | F1 | Duration |',
    '|-------|----------|-----------|--------|----|----------|',
  ];

  for (const run of runs) {
    for (const r of run.report.results) {
      lines.push(
        `| ${run.model} | ${r.approach} | ${pct(r.precision)} | ` +
        `${pct(r.recall)} | ${pct(r.f1)} | ${formatDuration(r.durationMs)} |`,
      );
    }
  }

  lines.push('', '## Summary (Best F1 per Model)', '');
  lines.push('| Model | Best F1 | Best Approach | Gate |');
  lines.push('|-------|---------|---------------|------|');

  for (const run of runs) {
    const best = run.report.results.reduce((a, b) =>
      b.f1 > a.f1 ? b : a,
    );
    const gate = run.report.passesGate ? 'PASS' : 'FAIL';
    lines.push(
      `| ${run.model} | ${pct(best.f1)} | ${best.approach} | ${gate} |`,
    );
  }

  return lines.join('\n');
}

/** Save intermediate results to a JSON file (called after each model). */
export function saveIntermediateResults(
  runs: ModelRunResult[],
  filePath: string,
): void {
  // Strip detections array to keep file size reasonable
  const slim = runs.map((r) => ({
    ...r,
    report: {
      ...r.report,
      results: r.report.results.map((res) => ({
        ...res,
        detections: `[${res.detections.length} items]`,
      })),
    },
  }));
  writeFileSync(filePath, JSON.stringify(slim, null, 2));
}
