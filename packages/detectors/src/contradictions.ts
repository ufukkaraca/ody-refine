// EXCEEDS_LIMIT: Heuristic detectors with multiple pattern-matching passes
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

const NUMBER_UNIT_PATTERN =
  /\$?(\d[\d,]*(?:\.\d+)?)\s*\+?\s*(?:per\s+)?(requests?|min|minutes?|hour|hours?|day|days?|month|months?|week|weeks?|\/\w+|calls?|users?|people|persons?|employees?|members?|%|percent|gpus?|nodes?|cores?|GBs?|instances?|seconds?|tokens?)/gi;

const BOOLEAN_PAIRS: [RegExp, RegExp, string, string][] = [
  [/\bremote[- ]first\b/i, /\b(?:in[- ]office|office[- ](?:first|required|days?)|monday|tuesday|wednesday|thursday|friday)\b/i,
    'remote-first', 'office requirement'],
  [/\brequired\b/i, /\boptional\b/i, 'required', 'optional'],
  [/\bmandatory\b/i, /\bnot\s+required\b/i, 'mandatory', 'not required'],
  [/\bdeprecated\b/i, /\bcurrent(?:ly)?\s+(?:supported|active|used)\b/i,
    'deprecated', 'current'],
  [/\benabled?\b/i, /\bdisabled?\b/i, 'enabled', 'disabled'],
  [/\bunder\s+a\s+minute\b/i, /\ba\s+few\s+minutes\b/i,
    'under a minute', 'a few minutes'],
  [/\bfree\b/i, /\bpaid\b/i, 'free', 'paid'],
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'but', 'not', 'with', 'from', 'by', 'into', 'it', 'its',
  'this', 'that', 'we', 'our', 'all', 'use', 'uses', 'used', 'than',
]);

const CONTEXT_STOPWORDS = new Set([
  'per', 'hour', 'hours', 'min', 'minute', 'minutes',
  'day', 'days', 'week', 'weeks', 'month', 'months', 'second', 'seconds',
]);

interface NumberFact { value: number; unit: string; raw: string; index: number }

/** Extract number+unit pairs from text. */
function extractNumbers(text: string): NumberFact[] {
  const results: NumberFact[] = [];
  const re = new RegExp(NUMBER_UNIT_PATTERN.source, NUMBER_UNIT_PATTERN.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1]!.replace(/,/g, ''));
    const unit = m[2]!.toLowerCase().replace(/s$/, '');
    results.push({ value, unit, raw: m[0], index: m.index });
  }
  return results;
}

/** Normalize unit names for comparison. */
function normalizeUnit(u: string): string {
  const map: Record<string, string> = {
    min: 'minute', minute: 'minute',
    hour: 'hour', day: 'day', week: 'week', month: 'month',
    request: 'request', call: 'call',
    user: 'user', people: 'person', person: 'person',
    employee: 'person', member: 'person',
  };
  return map[u] ?? u;
}

/** Get raw text from a node for content-based heuristics. */
function getNodeText(node: KnowledgeNode): string {
  const raw = node.content.raw ?? '';
  const facts = (node.content.facts ?? []).join(' ');
  return `${node.title} ${node.content.summary} ${facts} ${raw}`;
}

/** Extract the sentence containing the match at matchIndex. */
function extractSentence(text: string, matchIndex: number): string {
  let start = matchIndex;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1]!)) start--;
  let end = matchIndex;
  while (end < text.length && !/[.!?\n]/.test(text[end]!)) end++;
  return text.slice(start, end).trim();
}

/** Capitalize the first letter of a string. */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Extract topic keywords from a node's raw content only. */
function rawKeywords(node: KnowledgeNode): Set<string> {
  const text = node.content.raw ?? '';
  return new Set(
    text.toLowerCase().split(/\W+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !CONTEXT_STOPWORDS.has(w)),
  );
}

/** Canonical pair key for deduplication. */
function pairKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

/** Return true if two nodes plausibly discuss the same topic. */
function areSameTopic(a: KnowledgeNode, b: KnowledgeNode): boolean {
  const srcA = a.content.source?.sourceId ?? '';
  const srcB = b.content.source?.sourceId ?? '';
  if (srcA && srcB && srcA === srcB) return true;
  const wA = new Set(a.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  return b.title.toLowerCase().split(/\W+/).some((w) => w.length > 3 && wA.has(w));
}

/** Return true if both texts share an identical long sentence. */
function shareExactSentence(textA: string, textB: string): boolean {
  const sA = textA.split(/[.!?\n]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 20);
  const sB = new Set(textB.split(/[.!?\n]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 20));
  return sA.some((s) => sB.has(s));
}

/** Build set of entities appearing in >50% of nodes. */
function buildHighFreqEntities(nodes: KnowledgeNode[]): Set<string> {
  if (nodes.length <= 4) return new Set();
  const freq = new Map<string, number>();
  for (const node of nodes) {
    for (const ent of node.content.entities ?? []) {
      const name = ent.name.toLowerCase();
      freq.set(name, (freq.get(name) ?? 0) + 1);
    }
  }
  const threshold = nodes.length * 0.5;
  const result = new Set<string>();
  for (const [name, count] of freq) {
    if (count > threshold) result.add(name);
  }
  return result;
}

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

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const key = pairKey(a.id, b.id);
      if (seen.has(key)) continue;

      const pairDets: Detection[] = [];
      detectFactContradiction(a, b, pairDets, highFreqEntities);
      if (pairDets.length === 0) detectNumberContradiction(a, b, pairDets);
      if (pairDets.length === 0) detectBooleanContradiction(a, b, pairDets);
      if (pairDets.length > 0) {
        seen.add(key);
        out.push(...pairDets);
      }
    }
  }
}

/** Detect contradictions from shared entities with different facts. */
function detectFactContradiction(
  a: KnowledgeNode, b: KnowledgeNode, out: Detection[],
  highFreqEntities: Set<string>,
): void {
  const factsA = a.content.facts ?? [];
  const factsB = b.content.facts ?? [];
  if (factsA.length === 0 || factsB.length === 0) return;

  const entA = new Set((a.content.entities ?? []).map((e) => e.name.toLowerCase()));
  const entB = new Set((b.content.entities ?? []).map((e) => e.name.toLowerCase()));
  const shared = [...entA].filter((e) => entB.has(e) && !highFreqEntities.has(e));
  const meaningful = shared.filter((e) => e.length > 3);
  if (meaningful.length < 2) return;

  const setA = new Set(factsA.map((f) => f.toLowerCase()));
  const setB = new Set(factsB.map((f) => f.toLowerCase()));
  if ([...setA].every((f) => setB.has(f))) return;

  const kwA = new Set(factsA.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
  const kwB = new Set(factsB.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
  const onlyA = factsA.filter((f) => !setB.has(f.toLowerCase())).slice(0, 2);
  const onlyB = factsB.filter((f) => !setA.has(f.toLowerCase())).slice(0, 2);
  if (onlyA.length === 0 && onlyB.length === 0) return;
  if (![...kwA].some((k) => kwB.has(k))) return;

  const quoteA = onlyA.length > 0 ? onlyA.join('; ') : '(no unique claims)';
  const quoteB = onlyB.length > 0 ? onlyB.join('; ') : '(no unique claims)';

  const topic = meaningful.slice(0, 3).join(', ');
  out.push({
    type: 'contradiction', severity: 'info', nodeIds: [a.id, b.id],
    description:
      `When discussing ${topic}, "${a.title}" states: ${quoteA} — while "${b.title}" states: ${quoteB}`,
    suggestedAction: `Review "${a.title}" and "${b.title}" for consistency.`,
    metadata: {
      sharedEntities: meaningful, factsA: onlyA, factsB: onlyB,
      claimA: quoteA, claimB: quoteB, topic,
    },
  });
}

/** Detect number+unit contradictions with surrounding sentence context. */
function detectNumberContradiction(
  a: KnowledgeNode, b: KnowledgeNode, out: Detection[],
): void {
  if (!areSameTopic(a, b)) return;
  const textA = getNodeText(a);
  const textB = getNodeText(b);
  if (shareExactSentence(textA, textB)) return;
  const numsA = extractNumbers(textA);
  const numsB = extractNumbers(textB);
  if (numsA.length === 0 || numsB.length === 0) return;

  for (const na of numsA) {
    for (const nb of numsB) {
      if (normalizeUnit(na.unit) !== normalizeUnit(nb.unit)) continue;
      if (na.value === nb.value) continue;
      const sentA = extractSentence(textA, na.index);
      const sentB = extractSentence(textB, nb.index);
      if (sentA === sentB) continue;
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
  const textA = getNodeText(a);
  const textB = getNodeText(b);
  if (shareExactSentence(textA, textB)) return;

  for (const [pA, pB, lA, lB] of BOOLEAN_PAIRS) {
    const mAA = pA.exec(textA);
    const mBB = pB.exec(textB);
    const mAB = (!mAA || !mBB) ? pB.exec(textA) : null;
    const mBA = mAB ? pA.exec(textB) : null;

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

  // 2. LLM claim comparison (when available and nodes have facts)
  if (llm) {
    await detectClaimContradictions(nodes, llm, detections, seenPairs);
  }

  // 3. Heuristic fallback (always runs for pairs not yet covered)
  detectHeuristicContradictions(nodes, detections, seenPairs);

  return detections;
};

detectContradictions.preFilter = {
  similarityThreshold: 0.6,
  topK: 10,
};

export { detectContradictions, extractNumbers };
