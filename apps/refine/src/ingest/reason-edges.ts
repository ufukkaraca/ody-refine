// EXCEEDS_LIMIT: heuristic + LLM edge reasoning with extensive filtering
/**
 * Edge reasoning — creates relationship edges between similar knowledge nodes.
 * Runs AFTER nodes are embedded and stored. Uses heuristic or LLM classification.
 * @module ingest/reason-edges
 */
import crypto from 'node:crypto';
import type {
  EdgeRepository,
  EdgeType,
  KnowledgeEdge,
  KnowledgeNode,
  LLMProvider,
  VectorIndex,
} from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';

const MIN_SIMILARITY = 0.15;
const TOP_K_SIMILAR = 10;
/** Maximum number of LLM calls during edge reasoning to bound cost. */
const MAX_LLM_PAIRS = 30;
/** Maximum total edges to create — prevents explosion on large corpora. */
const MAX_EDGES = 50;
/** Concurrent LLM calls per batch. */
const LLM_BATCH_CONCURRENCY = 5;

// Only high-signal opposing pairs. Common words (yes/no, enabled/disabled,
// required/optional) produce massive false positives on real docs.
// Only very specific opposing pairs. Bare words like "remote/office" match
// project names and random contexts. Require multi-word phrases.
// Multi-word phrases only. Single words like "remote" match project names.
// "remote-first" is specific enough to indicate a work policy.
const OPPOSING_PAIRS: [string, string][] = [
  ['remote-first', 'office'],
  ['remote first', 'office'],
  ['deprecated', 'current'],
];

/** Extract numeric values with context from text. */
export function extractNumbers(text: string): { value: number; context: string }[] {
  const results: { value: number; context: string }[] = [];
  const patterns = [
    /\$?(\d[\d,]*(?:\.\d+)?)\s*(?:per\s+)?(requests?|calls?|days?|hours?|minutes?|min|sec|seconds?|gpus?|cores?|GBs?|nodes?|instances?|tokens?)/gi,
    /\$(\d[\d,]*(?:\.\d+)?)/g,
    /(\d[\d,]*(?:\.\d+)?)%/g,
    /(\d[\d,]*(?:\.\d+)?)\s+(?:per\s+)?(minute|hour|day|month|year|week)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1] ?? match[0];
      const value = Number(raw.replace(/,/g, ''));
      if (!Number.isNaN(value) && value > 0) {
        let start = match.index;
        while (start > 0 && !/[.!?\n]/.test(text[start - 1]!)) start--;
        let end = match.index + match[0].length;
        while (end < text.length && !/[.!?\n]/.test(text[end]!)) end++;
        results.push({ value, context: text.slice(start, end).trim() });
      }
    }
  }

  return results;
}

/** Check if two nodes have contradicting numbers in the same context. */
export function detectNumberContradiction(
  a: KnowledgeNode,
  b: KnowledgeNode,
): { contradicts: boolean; reason: string } {
  const textA = a.content.raw ?? a.content.summary;
  const textB = b.content.raw ?? b.content.summary;
  const numsA = extractNumbers(textA);
  const numsB = extractNumbers(textB);

  // Filter out colloquial uses and HTTP status codes
  const COLLOQUIAL = /\b(sure|certain|confident|probably|maybe|likely|unlikely)\b/i;
  const HTTP_STATUS = /\b(status|response|http|code|error)\b/i;
  const isHttpCode = (n: { value: number; context: string }): boolean =>
    n.value >= 100 && n.value <= 599 && HTTP_STATUS.test(n.context);
  const cleanA = numsA.filter((n) => !COLLOQUIAL.test(n.context) && !isHttpCode(n));
  const cleanB = numsB.filter((n) => !COLLOQUIAL.test(n.context) && !isHttpCode(n));

  for (const na of cleanA) {
    for (const nb of cleanB) {
      if (na.value === nb.value) continue;
      const ctxA = na.context.toLowerCase();
      const ctxB = nb.context.toLowerCase();
      // Exclude generic time/quantity words from context matching
      const GENERIC = new Set([
        'the', 'and', 'for', 'are', 'with', 'per', 'our',
        'day', 'days', 'hour', 'hours', 'month', 'months',
        'year', 'years', 'week', 'weeks', 'minute', 'minutes',
        'within', 'first', 'must', 'all', 'your', 'from',
        'requires', 'manager', 'approval', 'team',
      ]);
      const sharedWords = ctxA.split(/\s+/).filter(
        (w) => w.length >= 3 && !GENERIC.has(w) && ctxB.includes(w),
      );
      if (sharedWords.length >= 3) {
        return {
          contradicts: true,
          reason: `Conflicting numbers: ${na.value} vs ${nb.value} ` +
            `(context: "${na.context}" vs "${nb.context}")`,
        };
      }
    }
  }

  return { contradicts: false, reason: '' };
}

/** Check if two nodes contain opposing concepts. */
export function detectNegation(
  a: KnowledgeNode,
  b: KnowledgeNode,
): { contradicts: boolean; reason: string } {
  const textA = (a.content.raw ?? a.content.summary).toLowerCase();
  const textB = (b.content.raw ?? b.content.summary).toLowerCase();

  for (const [word1, word2] of OPPOSING_PAIRS) {
    const aHas1 = textA.includes(word1);
    const aHas2 = textA.includes(word2);
    const bHas1 = textB.includes(word1);
    const bHas2 = textB.includes(word2);

    if ((aHas1 && bHas2 && !aHas2) || (aHas2 && bHas1 && !aHas1)) {
      return {
        contradicts: true,
        reason: `Opposing concepts: "${word1}" vs "${word2}" ` +
          `in "${a.title}" and "${b.title}"`,
      };
    }
  }

  return { contradicts: false, reason: '' };
}

/** Date patterns to detect temporal content. */
const DATE_REGEX = /\b(Q[1-4]\s+20\d{2}|20\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+20\d{2})\b/gi;

/** Extract dates from text. Returns approximate timestamps. */
export function extractDates(text: string): Date[] {
  const dates: Date[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(DATE_REGEX.source, DATE_REGEX.flags);

  while ((match = regex.exec(text)) !== null) {
    const raw = match[1]!;
    const parsed = parseApproxDate(raw);
    if (parsed) dates.push(parsed);
  }

  return dates;
}

function parseApproxDate(raw: string): Date | null {
  const qMatch = raw.match(/Q([1-4])\s+(20\d{2})/);
  if (qMatch) {
    const quarter = Number(qMatch[1]);
    const year = Number(qMatch[2]);
    return new Date(year, (quarter - 1) * 3, 1);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Check if one node temporally supersedes another on the same topic. */
export function detectTemporalSupersession(
  a: KnowledgeNode,
  b: KnowledgeNode,
): { supersedes: boolean; newerId: string; olderId: string; reason: string } {
  const textA = a.content.raw ?? a.content.summary;
  const textB = b.content.raw ?? b.content.summary;
  const datesA = extractDates(textA);
  const datesB = extractDates(textB);

  if (datesA.length === 0 || datesB.length === 0) {
    return { supersedes: false, newerId: '', olderId: '', reason: '' };
  }

  // Only supersede if nodes are about the SAME topic (title word overlap)
  const wordsA = new Set(a.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const sharedTitle = [...wordsA].filter((w) => wordsB.has(w)).length;
  if (sharedTitle === 0) {
    return { supersedes: false, newerId: '', olderId: '', reason: '' };
  }

  const latestA = Math.max(...datesA.map((d) => d.getTime()));
  const latestB = Math.max(...datesB.map((d) => d.getTime()));

  if (latestA === latestB) {
    return { supersedes: false, newerId: '', olderId: '', reason: '' };
  }

  const [newerId, olderId] = latestA > latestB ? [a.id, b.id] : [b.id, a.id];
  const [newerTitle, olderTitle] = latestA > latestB
    ? [a.title, b.title]
    : [b.title, a.title];

  return {
    supersedes: true,
    newerId,
    olderId,
    reason: `"${newerTitle}" has newer dates than "${olderTitle}"`,
  };
}

/** Create an edge object. */
function makeEdge(
  sourceId: string,
  targetId: string,
  type: EdgeType,
  reason: string,
  confidence: number,
): KnowledgeEdge {
  return {
    id: crypto.randomUUID(),
    sourceId,
    targetId,
    type,
    reason,
    confidence,
    createdAt: new Date(),
  };
}

/**
 * Reason about edges heuristically (no LLM needed).
 * For each node, finds similar nodes via vector search and classifies relationships.
 */
export async function reasonEdgesHeuristic(
  nodes: KnowledgeNode[],
  edgeRepo: EdgeRepository,
  vecIndex: VectorIndex,
): Promise<number> {
  const seen = new Set<string>();
  let count = 0;

  for (const node of nodes) {
    if (node.embedding.length === 0) continue;
    const similar = await vecIndex.search(node.embedding, TOP_K_SIMILAR, MIN_SIMILARITY);

    for (const result of similar) {
      if (result.id === node.id) continue;
      const pairKey = [node.id, result.id].sort().join(':');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const other = nodes.find((n) => n.id === result.id);
      if (!other) continue;

      if (count >= MAX_EDGES) break;
      const edge = classifyPairHeuristic(node, other);
      if (edge) {
        await edgeRepo.upsert(edge);
        count++;
      }
    }
    if (count >= MAX_EDGES) break;
  }

  return count;
}

/** Classify the relationship between two nodes using heuristics. */
function classifyPairHeuristic(
  a: KnowledgeNode,
  b: KnowledgeNode,
): KnowledgeEdge | null {
  const numResult = detectNumberContradiction(a, b);
  if (numResult.contradicts) {
    return makeEdge(a.id, b.id, 'contradicts', numResult.reason, 0.85);
  }

  const negResult = detectNegation(a, b);
  if (negResult.contradicts) {
    return makeEdge(a.id, b.id, 'contradicts', negResult.reason, 0.8);
  }

  const temporal = detectTemporalSupersession(a, b);
  if (temporal.supersedes) {
    return makeEdge(
      temporal.newerId, temporal.olderId,
      'supersedes', temporal.reason, 0.7,
    );
  }

  return null;
}

/** LLM response shape for edge classification. */
interface LlmEdgeClassification {
  relationship: 'contradicts' | 'supersedes' | 'related' | 'none';
  reason: string;
}

/**
 * Reason about edges using an LLM for higher quality classification.
 * Caps at MAX_LLM_PAIRS calls and processes in concurrent batches.
 * @param onProgress - Called after each batch with (current, total) pair counts.
 */
export async function reasonEdgesWithLlm(
  nodes: KnowledgeNode[],
  edgeRepo: EdgeRepository,
  vecIndex: VectorIndex,
  llm: LLMProvider,
  onProgress?: (current: number, total: number) => void,
): Promise<number> {
  // Phase 1: collect unique pairs up to MAX_LLM_PAIRS
  const seen = new Set<string>();
  const pairs: [KnowledgeNode, KnowledgeNode][] = [];

  for (const node of nodes) {
    if (pairs.length >= MAX_LLM_PAIRS) break;
    if (node.embedding.length === 0) continue;
    const similar = await vecIndex.search(node.embedding, TOP_K_SIMILAR, MIN_SIMILARITY);

    for (const result of similar) {
      if (result.id === node.id) continue;
      const pairKey = [node.id, result.id].sort().join(':');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const other = nodes.find((n) => n.id === result.id);
      if (!other) continue;

      pairs.push([node, other]);
      if (pairs.length >= MAX_LLM_PAIRS) break;
    }
  }

  // Phase 2: process in concurrent batches
  let count = 0;
  for (let i = 0; i < pairs.length; i += LLM_BATCH_CONCURRENCY) {
    const batch = pairs.slice(i, i + LLM_BATCH_CONCURRENCY);
    const edges = await Promise.all(
      batch.map(([a, b]) => classifyPairWithLlm(a, b, llm)),
    );
    for (const edge of edges) {
      if (edge) {
        await edgeRepo.upsert(edge);
        count++;
      }
    }
    onProgress?.(Math.min(i + LLM_BATCH_CONCURRENCY, pairs.length), pairs.length);
  }

  return count;
}

const CLASSIFY_PROMPT = `Given two text chunks, determine their relationship:
- "contradicts": They make conflicting factual claims about the same topic
- "supersedes": Chunk A is a newer version of Chunk B (same topic, different dates)
- "related": They discuss the same topic but don't conflict
- "none": They're about different topics

Return ONLY JSON: {"relationship":"contradicts"|"supersedes"|"related"|"none","reason":"..."}`;

async function classifyPairWithLlm(
  a: KnowledgeNode,
  b: KnowledgeNode,
  llm: LLMProvider,
): Promise<KnowledgeEdge | null> {
  const textA = (a.content.raw ?? a.content.summary).slice(0, 500);
  const textB = (b.content.raw ?? b.content.summary).slice(0, 500);

  try {
    const response = await llm.complete([
      { role: 'system', content: CLASSIFY_PROMPT },
      { role: 'user', content: `Chunk A ("${a.title}"):\n${textA}\n\nChunk B ("${b.title}"):\n${textB}` },
    ], { temperature: 0.1, maxTokens: 200 });

    const parsed = parseLlmJsonResponse<LlmEdgeClassification>(response);
    if (!parsed.data || parsed.data.relationship === 'none') return null;

    const { relationship, reason } = parsed.data;
    if (relationship === 'contradicts') {
      return makeEdge(a.id, b.id, 'contradicts', reason, 0.9);
    }
    if (relationship === 'supersedes') {
      return makeEdge(a.id, b.id, 'supersedes', reason, 0.85);
    }
    if (relationship === 'related') {
      return makeEdge(a.id, b.id, 'related', reason, 0.6);
    }
  } catch {
    // LLM failed, fall back to heuristic
    return classifyPairHeuristic(a, b);
  }

  return null;
}
