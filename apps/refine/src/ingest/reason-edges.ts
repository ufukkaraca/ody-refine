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
import {
  extractNumbers,
  detectNumberContradiction,
  detectNegation,
  detectTemporalSupersession,
  extractDates,
} from './reason-edges-helpers.js';

// Re-export helpers for test access
export {
  extractNumbers,
  detectNumberContradiction,
  detectNegation,
  detectTemporalSupersession,
  extractDates,
};

const MIN_SIMILARITY = 0.15;
const TOP_K_SIMILAR = 10;
/** Maximum number of LLM calls during edge reasoning to bound cost. */
const MAX_LLM_PAIRS = 30;
/** Maximum total edges to create — prevents explosion on large corpora. */
const MAX_EDGES = 50;
/** Concurrent LLM calls per batch. */
const LLM_BATCH_CONCURRENCY = 5;

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

/** Classify a pair of nodes using LLM, with heuristic fallback. */
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
    return classifyPairHeuristic(a, b);
  }

  return null;
}
