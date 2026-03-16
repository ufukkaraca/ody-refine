import { describe, it, expect } from 'vitest';
import { detectUndocumented } from '../src/undocumented.js';
import type { KnowledgeNode } from '@useody/platform-core';

function makeChatNode(
  title: string,
  embedding: number[],
  facts: string[] = [],
): KnowledgeNode {
  return {
    id: crypto.randomUUID(),
    title,
    content: {
      summary: title,
      facts,
      source: { sourceType: 'slack', sourceId: crypto.randomUUID() },
    },
    embedding,
    embeddingModel: 'test',
    embeddingDim: embedding.length,
    confidence: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeDocNode(
  title: string,
  facts: string[] = [],
): KnowledgeNode {
  return {
    id: crypto.randomUUID(),
    title,
    content: {
      summary: title,
      facts,
      source: { sourceType: 'notion', sourceId: crypto.randomUUID() },
    },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 0,
    confidence: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Embedding vectors that are very similar (cosine sim > 0.64)
const SIMILAR_VEC_A = [1, 0, 0, 0.1];
const SIMILAR_VEC_B = [0.98, 0.05, 0, 0.12];
const SIMILAR_VEC_C = [0.97, 0.02, 0.01, 0.11];
const DIFFERENT_VEC = [0, 0, 1, 0];

describe('detectUndocumented', () => {
  it('detects undocumented topics with 3+ chat nodes', async () => {
    const nodes = [
      makeChatNode('API migration plan', SIMILAR_VEC_A, ['move to v2']),
      makeChatNode('API migration timeline', SIMILAR_VEC_B, ['deadline Q2']),
      makeChatNode('API migration status', SIMILAR_VEC_C, ['50% done']),
    ];

    const results = await detectUndocumented(nodes, []);
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe('undocumented');
    expect(results[0]!.severity).toBe('info');
    expect(results[0]!.nodeIds.length).toBe(3);
  });

  it('requires 3+ nodes for a cluster', async () => {
    const nodes = [
      makeChatNode('Topic A', SIMILAR_VEC_A),
      makeChatNode('Topic B', SIMILAR_VEC_B),
    ];

    const results = await detectUndocumented(nodes, []);
    expect(results).toHaveLength(0);
  });

  it('skips clusters with matching documentation', async () => {
    const chatNodes = [
      makeChatNode('API migration plan', SIMILAR_VEC_A, ['move to v2']),
      makeChatNode('API migration timeline', SIMILAR_VEC_B, ['deadline Q2']),
      makeChatNode('API migration status', SIMILAR_VEC_C, ['50% done']),
    ];
    const docNode = makeDocNode('API Migration Plan', ['move to v2']);

    const results = await detectUndocumented([...chatNodes, docNode], []);
    expect(results).toHaveLength(0);
  });

  it('sets severity to warning for 6+ mentions', async () => {
    const embedding = SIMILAR_VEC_A;
    const nodes = Array.from({ length: 7 }, (_, i) =>
      makeChatNode(`Topic ${i}`, embedding, [`fact ${i}`]),
    );

    const results = await detectUndocumented(nodes, []);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const first = results[0]!;
    expect(first.severity).toBe('warning');
  });

  it('ignores nodes without embeddings', async () => {
    const nodes = [
      makeChatNode('A', [], ['f1']),
      makeChatNode('B', [], ['f2']),
      makeChatNode('C', [], ['f3']),
    ];

    const results = await detectUndocumented(nodes, []);
    expect(results).toHaveLength(0);
  });

  it('separates chat and doc nodes by source type', async () => {
    // All doc nodes, no chat => no clusters => no detections
    const nodes = [
      makeDocNode('Topic A', ['fact']),
      makeDocNode('Topic B', ['fact']),
      makeDocNode('Topic C', ['fact']),
    ];

    const results = await detectUndocumented(nodes, []);
    expect(results).toHaveLength(0);
  });

  it('has requireAllNodes in preFilter', () => {
    expect(detectUndocumented.preFilter).toEqual({
      similarityThreshold: 0,
      topK: 0,
      requireAllNodes: true,
    });
  });
});
