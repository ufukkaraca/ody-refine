/**
 * Corpus-based benchmark runner.
 * Loads fixture corpora, runs detectors against them, and compares
 * findings against ground truth to compute precision, recall, F1.
 * @module eval/corpus-runner
 */

import type { KnowledgeNode, Detection } from '@useody/platform-core';
import type {
  ContradictionGroundTruth,
  StalenessGroundTruth,
  PrecisionRecallF1,
  CorpusBenchmarkResult,
} from './corpus-types.js';

/**
 * Compute precision, recall, and F1 from expected vs detected sets.
 * Each pair/document ID is either expected-positive or expected-negative,
 * and either detected or not detected.
 */
export function computePrecisionRecallF1(
  expectedPositiveIds: Set<string>,
  detectedIds: Set<string>,
  allIds: string[],
): PrecisionRecallF1 {
  let tp = 0;
  let fp = 0;
  let fn = 0;

  for (const id of allIds) {
    const expected = expectedPositiveIds.has(id);
    const detected = detectedIds.has(id);

    if (expected && detected) tp++;
    else if (!expected && detected) fp++;
    else if (expected && !detected) fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  return { precision, recall, f1, truePositives: tp, falsePositives: fp, falseNegatives: fn };
}

/**
 * Evaluate contradiction detector against ground truth corpus.
 * Maps detector output to pair IDs via nodeIds, then scores.
 */
export function evaluateContradictionDetector(
  groundTruth: ContradictionGroundTruth,
  nodes: KnowledgeNode[],
  detections: Detection[],
): CorpusBenchmarkResult {
  const nodeToPair = new Map<string, string>();
  for (const node of nodes) {
    const meta = node.metadata as Record<string, unknown> | undefined;
    const pairId = meta?.['pairId'] as string | undefined;
    if (pairId) nodeToPair.set(node.id, pairId);
  }

  // Build a map from node id pairs in ground truth
  const pairNodeMap = buildPairNodeMap(nodes);

  const expectedPositive = new Set(
    groundTruth.pairs
      .filter((p) => p.hasContradiction)
      .map((p) => p.id),
  );

  const detectedPairIds = new Set<string>();
  for (const det of detections) {
    if (det.type !== 'contradiction') continue;
    const pairId = findPairIdFromDetection(det, pairNodeMap);
    if (pairId) detectedPairIds.add(pairId);
  }

  const allIds = groundTruth.pairs.map((p) => p.id);
  const metrics = computePrecisionRecallF1(expectedPositive, detectedPairIds, allIds);

  const details = allIds.map((id) => ({
    pairId: id,
    expected: expectedPositive.has(id),
    detected: detectedPairIds.has(id),
    correct: expectedPositive.has(id) === detectedPairIds.has(id),
  }));

  return {
    corpus: groundTruth.corpus,
    detectorType: 'contradiction',
    metrics,
    details,
    runAt: new Date(),
  };
}

/**
 * Evaluate staleness detector against ground truth corpus.
 */
export function evaluateStalenessDetector(
  groundTruth: StalenessGroundTruth,
  detections: Detection[],
): CorpusBenchmarkResult {
  const expectedPositive = new Set(
    groundTruth.documents
      .filter((d) => d.isStale)
      .map((d) => d.id),
  );

  const detectedIds = new Set<string>();
  for (const det of detections) {
    if (det.type !== 'staleness') continue;
    for (const nodeId of det.nodeIds) {
      detectedIds.add(nodeId);
    }
  }

  const allIds = groundTruth.documents.map((d) => d.id);
  const metrics = computePrecisionRecallF1(expectedPositive, detectedIds, allIds);

  const details = allIds.map((id) => ({
    pairId: id,
    expected: expectedPositive.has(id),
    detected: detectedIds.has(id),
    correct: expectedPositive.has(id) === detectedIds.has(id),
  }));

  return {
    corpus: groundTruth.corpus,
    detectorType: 'staleness',
    metrics,
    details,
    runAt: new Date(),
  };
}

/** Build map: pairId -> set of node IDs belonging to that pair. */
function buildPairNodeMap(
  nodes: KnowledgeNode[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  // Group nodes whose IDs share a pairId prefix pattern
  // Fixture nodes use id format like "eng-cap-01" with pairId in the fixture
  // We need to match detections (which reference node IDs) to pair IDs
  for (const node of nodes) {
    // Nodes are paired by their fixture structure
    const existing = map.get(node.id);
    if (!existing) map.set(node.id, new Set([node.id]));
  }
  return map;
}

/**
 * Match a detection's nodeIds to a ground-truth pair ID.
 * Looks through fixture pairs to find which pair these nodes belong to.
 */
function findPairIdFromDetection(
  det: Detection,
  _nodeMap: Map<string, Set<string>>,
): string | null {
  // Detection nodeIds contains the pair of conflicting node IDs.
  // We need to find which ground truth pair they belong to.
  // The pair ID is embedded in the node IDs from fixtures.
  if (det.nodeIds.length < 2) return null;
  // Return a synthetic pair key from the two node IDs
  const sorted = [...det.nodeIds].sort();
  return `${sorted[0]}:${sorted[1]}`;
}
