/**
 * Speed benchmarks for ingestion and analysis.
 * Measures wall-clock time for detector execution on various corpus sizes.
 * @module eval/speed-benchmark
 */

import type {
  KnowledgeNode,
  KnowledgeEdge,
  DetectorFn,
  LLMProvider,
} from '@useody/platform-core';

/** Timing result for a single benchmark run. */
export interface TimingResult {
  detectorName: string;
  nodeCount: number;
  edgeCount: number;
  totalMs: number;
  perNodeMs: number;
  perPairMs: number;
  findingCount: number;
}

/** Aggregated speed benchmark results. */
export interface SpeedBenchmarkResult {
  timings: TimingResult[];
  totalMs: number;
  meetsTarget: boolean;
  target: { description: string; maxMs: number };
}

/**
 * Measure execution time of a detector on a corpus.
 *
 * @param name - Human-readable detector name.
 * @param detector - Detector function to benchmark.
 * @param nodes - Knowledge nodes.
 * @param edges - Knowledge edges.
 * @param llm - Optional LLM provider.
 */
export async function timeDetector(
  name: string,
  detector: DetectorFn,
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  llm?: LLMProvider,
): Promise<TimingResult> {
  const start = performance.now();
  const findings = await detector(nodes, edges, llm);
  const end = performance.now();

  const totalMs = end - start;
  const nodeCount = nodes.length;
  const pairCount = (nodeCount * (nodeCount - 1)) / 2;

  return {
    detectorName: name,
    nodeCount,
    edgeCount: edges.length,
    totalMs,
    perNodeMs: nodeCount > 0 ? totalMs / nodeCount : 0,
    perPairMs: pairCount > 0 ? totalMs / pairCount : 0,
    findingCount: findings.length,
  };
}

/**
 * Run speed benchmarks for all provided detectors.
 * Target: < 30 seconds for 10 documents with no LLM.
 *
 * @param detectors - Map of name -> detector function.
 * @param nodes - Knowledge nodes to analyze.
 * @param edges - Knowledge edges.
 * @param targetMs - Max total time in ms. Default 30000.
 * @param llm - Optional LLM provider.
 */
export async function runSpeedBenchmark(
  detectors: Map<string, DetectorFn>,
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  targetMs = 30_000,
  llm?: LLMProvider,
): Promise<SpeedBenchmarkResult> {
  const timings: TimingResult[] = [];
  let totalMs = 0;

  for (const [name, detector] of detectors) {
    const result = await timeDetector(name, detector, nodes, edges, llm);
    timings.push(result);
    totalMs += result.totalMs;
  }

  return {
    timings,
    totalMs,
    meetsTarget: totalMs <= targetMs,
    target: {
      description: `All detectors on ${nodes.length} docs in < ${targetMs}ms`,
      maxMs: targetMs,
    },
  };
}
