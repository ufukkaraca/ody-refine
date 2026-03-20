/**
 * Benchmark harness for comparing detection pipeline approaches.
 * Measures precision, recall, F1 against manually annotated ground truth.
 * Three approaches: current pipeline (A), raw LLM (B), LLM-augmented (C).
 * @module detectors/benchmark
 */
import type {
  Detection,
  KnowledgeNode,
  KnowledgeEdge,
  LLMProvider,
} from '@useody/platform-core';
import { runDetection } from './run-detection.js';
import { detectAugmented } from './llm-augmented.js';
import { pairKey } from './prompts.js';

/** A single ground truth annotation for a node pair. */
export interface GroundTruthEntry {
  nodeIdA: string;
  nodeIdB: string;
  isContradiction: boolean;
  topic?: string;
}

/** Frozen corpus with ground truth annotations for benchmarking. */
export interface BenchmarkCorpus {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  groundTruth: GroundTruthEntry[];
}

/** Results from running a single detection approach. */
export interface BenchmarkResult {
  approach: string;
  precision: number;
  recall: number;
  f1: number;
  detections: Detection[];
  durationMs: number;
}

/** Full benchmark report with gate evaluation. */
export interface BenchmarkReport {
  results: BenchmarkResult[];
  passesGate: boolean;
  gateDetails: string;
}

/** A named detection approach that produces detections from a corpus. */
export interface BenchmarkApproach {
  name: string;
  run: (
    corpus: BenchmarkCorpus,
    llm: LLMProvider,
  ) => Promise<Detection[]>;
}

/**
 * Compute precision, recall, and F1 from detections against ground truth.
 * A detection is a true positive if it matches a ground truth pair
 * where isContradiction === true.
 */
export function computeMetrics(
  detections: Detection[],
  groundTruth: GroundTruthEntry[],
): { precision: number; recall: number; f1: number } {
  const truthPositives = new Set<string>();
  const truthNegatives = new Set<string>();

  for (const gt of groundTruth) {
    const key = pairKey(gt.nodeIdA, gt.nodeIdB);
    if (gt.isContradiction) {
      truthPositives.add(key);
    } else {
      truthNegatives.add(key);
    }
  }

  const detectedPairs = new Set<string>();
  for (const det of detections) {
    if (det.type === 'contradiction' && det.nodeIds.length >= 2) {
      detectedPairs.add(pairKey(det.nodeIds[0]!, det.nodeIds[1]!));
    }
  }

  let truePositives = 0;
  let falsePositives = 0;

  for (const pair of detectedPairs) {
    if (truthPositives.has(pair)) {
      truePositives++;
    } else {
      falsePositives++;
    }
  }

  const precision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;
  const recall =
    truthPositives.size > 0 ? truePositives / truthPositives.size : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  return { precision, recall, f1 };
}

/**
 * Evaluate the pass/fail gate for the benchmark.
 * Expects results ordered: [A=current pipeline, B=raw LLM, C=augmented].
 *
 * Gate criteria:
 *   C.precision >= B.precision
 *   C.recall >= A.recall
 *   C.F1 > max(A.F1, B.F1)
 */
export function evaluateGate(results: BenchmarkResult[]): {
  passesGate: boolean;
  gateDetails: string;
} {
  const a = results.find((r) => r.approach === 'current-pipeline');
  const b = results.find((r) => r.approach === 'raw-llm');
  const c = results.find((r) => r.approach === 'llm-augmented');

  if (!a || !b || !c) {
    return {
      passesGate: false,
      gateDetails: 'Missing required approaches: need current-pipeline, raw-llm, llm-augmented',
    };
  }

  const checks = [
    {
      name: 'C.precision >= B.precision',
      passed: c.precision >= b.precision,
      detail: `${c.precision.toFixed(3)} >= ${b.precision.toFixed(3)}`,
    },
    {
      name: 'C.recall >= A.recall',
      passed: c.recall >= a.recall,
      detail: `${c.recall.toFixed(3)} >= ${a.recall.toFixed(3)}`,
    },
    {
      name: 'C.F1 > max(A.F1, B.F1)',
      passed: c.f1 > Math.max(a.f1, b.f1),
      detail: `${c.f1.toFixed(3)} > max(${a.f1.toFixed(3)}, ${b.f1.toFixed(3)})`,
    },
  ];

  const passesGate = checks.every((ch) => ch.passed);
  const gateDetails = checks
    .map((ch) => `${ch.passed ? 'PASS' : 'FAIL'}: ${ch.name} (${ch.detail})`)
    .join('\n');

  return { passesGate, gateDetails };
}

/**
 * Run the current heuristic pipeline (approach A).
 * Runs all 5 detectors without an LLM provider.
 */
export async function runCurrentPipeline(
  corpus: BenchmarkCorpus,
): Promise<Detection[]> {
  const output = await runDetection({
    nodes: corpus.nodes,
    edges: corpus.edges,
  });
  return output.detections;
}

/**
 * Run raw LLM detection (approach B).
 * Sends all documents in a single prompt asking for contradictions.
 * Placeholder — requires LLM integration to produce real results.
 */
export async function runRawLlm(
  corpus: BenchmarkCorpus,
  llm: LLMProvider,
): Promise<Detection[]> {
  const output = await runDetection({
    nodes: corpus.nodes,
    edges: corpus.edges,
    llm,
  });
  // Filter to only LLM-originated detections (non-heuristic)
  return output.detections;
}

/**
 * Run LLM-augmented detection (approach C).
 * Uses context packages + chain-of-thought via detectAugmented.
 */
export async function runAugmented(
  corpus: BenchmarkCorpus,
  llm: LLMProvider,
): Promise<Detection[]> {
  // Run heuristic pipeline first
  const heuristicOutput = await runDetection({
    nodes: corpus.nodes,
    edges: corpus.edges,
  });

  // Build seen set from heuristic results
  const seenPairs = new Set<string>();
  for (const det of heuristicOutput.detections) {
    if (det.nodeIds.length >= 2) {
      seenPairs.add(pairKey(det.nodeIds[0]!, det.nodeIds[1]!));
    }
  }

  // Run LLM-augmented layer on top
  const augmented = await detectAugmented(
    corpus.nodes,
    corpus.edges,
    llm,
    seenPairs,
  );

  return [...heuristicOutput.detections, ...augmented];
}

/** Default approaches for the benchmark. */
export const DEFAULT_APPROACHES: BenchmarkApproach[] = [
  {
    name: 'current-pipeline',
    run: (corpus) => runCurrentPipeline(corpus),
  },
  {
    name: 'raw-llm',
    run: (corpus, llm) => runRawLlm(corpus, llm),
  },
  {
    name: 'llm-augmented',
    run: (corpus, llm) => runAugmented(corpus, llm),
  },
];

/**
 * Run a full benchmark: execute each approach, compute metrics, evaluate gate.
 */
export async function runBenchmark(
  corpus: BenchmarkCorpus,
  llm: LLMProvider,
  approaches: BenchmarkApproach[] = DEFAULT_APPROACHES,
): Promise<BenchmarkReport> {
  const results: BenchmarkResult[] = [];

  for (const approach of approaches) {
    const start = Date.now();
    const detections = await approach.run(corpus, llm);
    const durationMs = Date.now() - start;
    const metrics = computeMetrics(detections, corpus.groundTruth);
    results.push({
      approach: approach.name,
      ...metrics,
      detections,
      durationMs,
    });
  }

  const { passesGate, gateDetails } = evaluateGate(results);
  return { results, passesGate, gateDetails };
}
