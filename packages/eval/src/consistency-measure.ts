/**
 * Consistency measurement for detector output.
 * Runs the same detector N times on the same corpus and measures
 * pairwise Jaccard similarity of findings to assess determinism.
 * @module eval/consistency-measure
 */

import type { Detection, DetectorFn, KnowledgeNode, KnowledgeEdge, LLMProvider } from '@useody/platform-core';

/** Canonical key for a detection (type + sorted nodeIds). */
function detectionKey(d: Detection): string {
  const sortedIds = [...d.nodeIds].sort().join(',');
  return `${d.type}:${sortedIds}`;
}

/** Jaccard similarity: |A intersect B| / |A union B|. */
function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}

/** Result of a consistency measurement. */
export interface ConsistencyResult {
  /** Number of runs performed. */
  runs: number;
  /** Mean pairwise Jaccard similarity. */
  meanSimilarity: number;
  /** Minimum pairwise Jaccard similarity. */
  minSimilarity: number;
  /** Maximum pairwise Jaccard similarity. */
  maxSimilarity: number;
  /** Whether the target threshold was met. */
  passesThreshold: boolean;
  /** Threshold used for the pass/fail check. */
  threshold: number;
  /** Number of unique findings across all runs. */
  uniqueFindings: number;
  /** Finding counts per run. */
  findingsPerRun: number[];
}

/**
 * Measure consistency of a detector by running it N times.
 * For deterministic detectors (heuristic-only), expect Jaccard = 1.0.
 * For LLM-based detectors, target >= 0.8.
 *
 * @param detector - The detector function to test.
 * @param nodes - Knowledge nodes to analyze.
 * @param edges - Knowledge edges for the analysis.
 * @param runs - Number of times to run the detector. Default 5.
 * @param threshold - Minimum Jaccard similarity. Default 0.8.
 * @param llm - Optional LLM provider.
 */
export async function measureConsistency(
  detector: DetectorFn,
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  runs = 5,
  threshold = 0.8,
  llm?: LLMProvider,
): Promise<ConsistencyResult> {
  const runResults: Set<string>[] = [];
  const findingsPerRun: number[] = [];

  for (let i = 0; i < runs; i++) {
    const detections = await detector(nodes, edges, llm);
    const keys = new Set(detections.map(detectionKey));
    runResults.push(keys);
    findingsPerRun.push(detections.length);
  }

  // Compute pairwise Jaccard similarities
  const similarities: number[] = [];
  for (let i = 0; i < runs; i++) {
    for (let j = i + 1; j < runs; j++) {
      similarities.push(jaccard(runResults[i]!, runResults[j]!));
    }
  }

  const meanSimilarity = similarities.length > 0
    ? similarities.reduce((s, v) => s + v, 0) / similarities.length
    : 1;
  const minSimilarity = similarities.length > 0
    ? Math.min(...similarities)
    : 1;
  const maxSimilarity = similarities.length > 0
    ? Math.max(...similarities)
    : 1;

  const allFindings = new Set<string>();
  for (const r of runResults) {
    for (const k of r) allFindings.add(k);
  }

  return {
    runs,
    meanSimilarity,
    minSimilarity,
    maxSimilarity,
    passesThreshold: minSimilarity >= threshold,
    threshold,
    uniqueFindings: allFindings.size,
    findingsPerRun,
  };
}

export { jaccard, detectionKey };
