// EXCEEDS_LIMIT: three detection strategies + enrichment boost pipeline
/**
 * Contradiction detector.
 * Finds knowledge nodes that contradict each other via edges, LLM claim
 * comparison, or content heuristics (fallback when no LLM is available).
 * @module contradictions
 */
import type {
  KnowledgeNode,
  KnowledgeEdge,
  Detection,
  DetectorFn,
  LLMProvider,
} from '@useody/platform-core';
import { detectClaimContradictions } from './claim-comparison.js';
import { detectClaimNliContradictions } from './claim-nli.js';
import {
  extractNumbers,
  normalizeUnit,
  getNodeText,
  extractSentence,
  capitalizeFirst,
  rawKeywords,
  pairKey,
  areSameTopic,
  shareExactSentence,
  buildHighFreqEntities,
  detectFactContradiction,
  detectOwnershipContradiction,
  BOOLEAN_PAIRS,
  CONFIG_CONTEXT,
} from './contradiction-helpers.js';

/** Detect edge-based contradictions. */
function detectEdgeContradictions(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  out: Detection[],
  seen: Set<string>,
): void {
  const contradictEdges = edges.filter((e) => e.type === 'contradicts');
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of contradictEdges) {
    const nodeA = nodeMap.get(edge.sourceId);
    const nodeB = nodeMap.get(edge.targetId);
    if (!nodeA || !nodeB) continue;
    const key = pairKey(nodeA.id, nodeB.id);
    seen.add(key);
    out.push({
      type: 'contradiction',
      severity: edge.confidence >= 0.8 ? 'critical' : 'warning',
      nodeIds: [nodeA.id, nodeB.id],
      description: edge.reason,
      suggestedAction:
        `Resolve which is current: "${nodeA.title}" or "${nodeB.title}"`,
    });
  }
}

/** Heuristic fallback: number, boolean, and fact-based detection. */
function detectHeuristicContradictions(
  nodes: KnowledgeNode[],
  out: Detection[],
  seen: Set<string>,
): void {
  const highFreqEntities = buildHighFreqEntities(nodes);
  const MAX_FACT_INFO = 10;
  let factInfoCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const key = pairKey(a.id, b.id);
      if (seen.has(key)) continue;

      const pairDets: Detection[] = [];
      if (factInfoCount < MAX_FACT_INFO) {
        detectFactContradiction(a, b, pairDets, highFreqEntities);
        if (pairDets.some((d) => d.severity === 'info')) factInfoCount++;
      }
      if (pairDets.length === 0) detectNumberContradiction(a, b, pairDets);
      if (pairDets.length === 0) detectBooleanContradiction(a, b, pairDets);
      if (pairDets.length === 0) detectOwnershipContradiction(a, b, pairDets);
      if (pairDets.length > 0) {
        seen.add(key);
        out.push(...pairDets);
      }
    }
  }
}

/** Detect number+unit contradictions with surrounding sentence context. */
function detectNumberContradiction(
  a: KnowledgeNode, b: KnowledgeNode, out: Detection[],
): void {
  if (!areSameTopic(a, b)) return;
  const srcA = a.content.source?.sourceId ?? '';
  const srcB = b.content.source?.sourceId ?? '';
  if (srcA && srcB && srcA === srcB) return;
  const textA = getNodeText(a);
  const textB = getNodeText(b);
  if (shareExactSentence(textA, textB)) return;
  const COLLOQUIAL_RE = /\b(sure|certain|confident|probably|maybe)\b/i;
  const numsA = extractNumbers(textA).filter(
    (n) => !COLLOQUIAL_RE.test(extractSentence(textA, n.index)),
  );
  const numsB = extractNumbers(textB).filter(
    (n) => !COLLOQUIAL_RE.test(extractSentence(textB, n.index)),
  );
  if (numsA.length === 0 || numsB.length === 0) return;

  const SKIP_UNITS = new Set(['percent', '%']);
  const HTTP_STATUS_RE = /\b(status|response|http|code|error)\b/i;
  const TIME_UNITS = new Set(['day', 'hour', 'minute', 'week', 'month', 'second']);

  for (const na of numsA) {
    if (SKIP_UNITS.has(normalizeUnit(na.unit))) continue;
    if (na.value >= 100 && na.value <= 599 && HTTP_STATUS_RE.test(extractSentence(textA, na.index))) continue;
    for (const nb of numsB) {
      if (normalizeUnit(na.unit) !== normalizeUnit(nb.unit)) continue;
      if (na.value === nb.value) continue;
      const sentA = extractSentence(textA, na.index);
      const sentB = extractSentence(textB, nb.index);
      if (sentA === sentB) continue;
      if (TIME_UNITS.has(normalizeUnit(na.unit))) {
        const sentKwA = new Set(sentA.toLowerCase().split(/\W+/).filter((w) => w.length >= 4));
        const sentKwB = new Set(sentB.toLowerCase().split(/\W+/).filter((w) => w.length >= 4));
        const sentShared = [...sentKwA].filter((w) => sentKwB.has(w));
        if (sentShared.length < 2) continue;
      }
      const kwA = rawKeywords(a);
      const kwB = rawKeywords(b);
      const sharedCount = [...kwA].filter((k) => kwB.has(k)).length;
      if (sharedCount < 2) continue;
      const unitLabel = capitalizeFirst(normalizeUnit(na.unit));
      out.push({
        type: 'contradiction', severity: 'warning', nodeIds: [a.id, b.id],
        description: `${unitLabel} inconsistency between ${a.title} and ${b.title}: "${na.raw}" vs "${nb.raw}"`,
        suggestedAction: `Review "${a.title}" and "${b.title}" for consistency.`,
        metadata: {
          nodeExcerpts: { [a.id]: sentA, [b.id]: sentB },
          claimA: na.raw, claimB: nb.raw, topic: `${unitLabel} values`,
        },
      });
      return;
    }
  }
}

/** Detect boolean/opposing concept contradictions from raw content. */
function detectBooleanContradiction(
  a: KnowledgeNode, b: KnowledgeNode, out: Detection[],
): void {
  if (!areSameTopic(a, b)) return;
  const srcA = a.content.source?.sourceId ?? '';
  const srcB = b.content.source?.sourceId ?? '';
  if (srcA && srcB && srcA === srcB) return;
  const textA = getNodeText(a);
  const textB = getNodeText(b);
  if (shareExactSentence(textA, textB)) return;

  for (const [pA, pB, lA, lB] of BOOLEAN_PAIRS) {
    const mAA = pA.exec(textA);
    const mBB = pB.exec(textB);
    const mAB = (!mAA || !mBB) ? pB.exec(textA) : null;
    const mBA = mAB ? pA.exec(textB) : null;

    const skipLabels = new Set(['enabled', 'disabled', 'required', 'optional', 'mandatory', 'not required']);
    if (skipLabels.has(lA) || skipLabels.has(lB)) {
      const ctxA = mAA ? extractSentence(textA, mAA.index) : mAB ? extractSentence(textA, mAB.index) : '';
      const ctxB = mBB ? extractSentence(textB, mBB.index) : mBA ? extractSentence(textB, mBA.index) : '';
      if (CONFIG_CONTEXT.test(ctxA) || CONFIG_CONTEXT.test(ctxB)) continue;
    }

    const match = mAA && mBB
      ? { m1: mAA, m2: mBB, la: lA, lb: lB }
      : mAB && mBA ? { m1: mAB, m2: mBA, la: lB, lb: lA } : null;
    if (!match) continue;

    const sentA = extractSentence(textA, match.m1.index);
    const sentB = extractSentence(textB, match.m2.index);
    out.push({
      type: 'contradiction', severity: 'warning', nodeIds: [a.id, b.id],
      description: `Policy conflict between ${a.title} and ${b.title}: "${match.la}" vs "${match.lb}"`,
      suggestedAction: `Review "${a.title}" and "${b.title}" for consistency.`,
      metadata: {
        nodeExcerpts: { [a.id]: sentA, [b.id]: sentB },
        claimA: match.la, claimB: match.lb,
        topic: `${match.la} vs ${match.lb}`,
      },
    });
    return;
  }
}

/** Check if two nodes are siblings (share the same parent chain prefix). */
function areSiblings(a: KnowledgeNode, b: KnowledgeNode): boolean {
  const chainA = a.metadata?.['parentChain'] as
    Array<{ type: string; name: string; id?: string }> | undefined;
  const chainB = b.metadata?.['parentChain'] as
    Array<{ type: string; name: string; id?: string }> | undefined;
  if (!chainA?.length || !chainB?.length) return false;
  // Compare all but the last element (the document itself)
  const parentA = chainA.slice(0, -1);
  const parentB = chainB.slice(0, -1);
  if (parentA.length === 0 || parentB.length === 0) return false;
  if (parentA.length !== parentB.length) return false;
  return parentA.every((p, i) =>
    p.type === parentB[i]!.type && p.name === parentB[i]!.name,
  );
}

/** Check if both nodes have authoritative analysis hints. */
function areBothAuthoritative(a: KnowledgeNode, b: KnowledgeNode): boolean {
  const hintsA = a.metadata?.['analysisHints'] as
    { authoritative?: boolean } | undefined;
  const hintsB = b.metadata?.['analysisHints'] as
    { authoritative?: boolean } | undefined;
  return hintsA?.authoritative === true && hintsB?.authoritative === true;
}

/** Apply enrichment-based severity boosts to detections. */
function applyEnrichmentBoosts(
  detections: Detection[],
  nodes: KnowledgeNode[],
): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const det of detections) {
    if (det.nodeIds.length < 2) continue;
    const a = nodeMap.get(det.nodeIds[0]!);
    const b = nodeMap.get(det.nodeIds[1]!);
    if (!a || !b) continue;

    // Both authoritative → always critical
    if (areBothAuthoritative(a, b)) {
      det.severity = 'critical';
      det.metadata = { ...det.metadata, boostReason: 'both-authoritative' };
      continue;
    }

    // Sibling docs (same parent) → upgrade info→warning, warning→critical
    if (areSiblings(a, b) && det.severity !== 'critical') {
      det.severity = det.severity === 'info' ? 'warning' : 'critical';
      det.metadata = { ...det.metadata, boostReason: 'sibling-docs' };
    }
  }
}

/**
 * Detect contradictions between knowledge nodes.
 * Uses edges first, then LLM claim comparison (if available),
 * otherwise falls back to heuristic detection.
 */
const detectContradictions: DetectorFn = async (
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  llm?: LLMProvider,
): Promise<Detection[]> => {
  const detections: Detection[] = [];
  const seenPairs = new Set<string>();

  // 1. Edge-based contradictions (always)
  detectEdgeContradictions(nodes, edges, detections, seenPairs);

  // 2. Claim-based NLI detection (primary LLM path)
  if (llm) {
    const beforeNli = detections.length;
    await detectClaimNliContradictions(nodes, llm, detections, seenPairs);
    if (detections.length === beforeNli) {
      await detectClaimContradictions(nodes, llm, detections, seenPairs);
    }
  }

  // 3. Heuristic fallback (always runs for pairs not yet covered)
  const beforeHeuristic = detections.length;
  detectHeuristicContradictions(nodes, detections, seenPairs);

  const MAX_HEURISTIC = 50;
  if (detections.length - beforeHeuristic > MAX_HEURISTIC) {
    detections.splice(beforeHeuristic + MAX_HEURISTIC);
  }

  // 4. Enrichment boosts (parentChain + analysisHints)
  applyEnrichmentBoosts(detections, nodes);

  return detections;
};

detectContradictions.preFilter = {
  similarityThreshold: 0.6,
  topK: 10,
};

export {
  detectContradictions,
  extractNumbers,
  areSiblings,
  areBothAuthoritative,
};
