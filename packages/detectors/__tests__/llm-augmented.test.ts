import { describe, it, expect, vi } from 'vitest';
import type {
  KnowledgeNode,
  LLMProvider,
} from '@useody/platform-core';
import { detectAugmented } from '../src/llm-augmented.js';

function makeNode(
  id: string,
  title: string,
  entities: Array<{ name: string; type: string }> = [],
  facts: string[] = [],
): KnowledgeNode {
  return {
    id,
    title,
    content: {
      summary: `Summary of ${title}`,
      facts,
      entities,
      source: { sourceType: 'notion', sourceId: `src-${id}` },
    },
    embedding: [0.1],
    embeddingModel: 'test',
    embeddingDim: 1,
    confidence: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeLlm(response: string): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue(response),
    stream: vi.fn(),
    getModelId: () => 'test-model',
  };
}

const sharedEntities = [
  { name: 'API', type: 'product' },
  { name: 'rate-limit', type: 'concept' },
];

describe('llm-augmented', () => {
  it('detects contradictions from LLM analysis', async () => {
    const nodes = [
      makeNode('a', 'API Docs', sharedEntities, ['Rate limit is 1000/min']),
      makeNode('b', 'API Guide', sharedEntities, ['Rate limit is 500/min']),
    ];
    const llm = makeLlm(JSON.stringify([{
      isContradiction: true,
      nodeIdA: 'a',
      nodeIdB: 'b',
      topic: 'API rate limit',
      claimA: 'Rate limit is 1000/min',
      claimB: 'Rate limit is 500/min',
      severity: 'critical',
      reasoning: 'Both docs state different rate limits for the same API',
    }]));

    const detections = await detectAugmented(nodes, [], llm, new Set());
    expect(detections.length).toBe(1);
    expect(detections[0]!.type).toBe('contradiction');
    expect(detections[0]!.metadata?.['detector']).toBe('llm-augmented');
    expect(detections[0]!.metadata?.['reasoning']).toContain('rate limits');
  });

  it('returns empty when LLM finds no contradictions', async () => {
    const nodes = [
      makeNode('a', 'Doc A', sharedEntities, ['API supports REST']),
      makeNode('b', 'Doc B', sharedEntities, ['API supports GraphQL']),
    ];
    const llm = makeLlm('[]');

    const detections = await detectAugmented(nodes, [], llm, new Set());
    expect(detections.length).toBe(0);
  });

  it('deduplicates with existing seen pairs', async () => {
    const nodes = [
      makeNode('a', 'Doc A', sharedEntities, ['Rate limit 1000']),
      makeNode('b', 'Doc B', sharedEntities, ['Rate limit 500']),
    ];
    const llm = makeLlm(JSON.stringify([{
      isContradiction: true,
      nodeIdA: 'a',
      nodeIdB: 'b',
      topic: 'rate limit',
      claimA: '1000',
      claimB: '500',
      severity: 'warning',
      reasoning: 'different limits',
    }]));

    // Already seen by heuristic detector
    const seen = new Set(['a:b']);
    const detections = await detectAugmented(nodes, [], llm, seen);
    expect(detections.length).toBe(0);
  });

  it('skips findings with invalid node IDs', async () => {
    const nodes = [
      makeNode('a', 'Doc A', sharedEntities, ['fact']),
      makeNode('b', 'Doc B', sharedEntities, ['fact']),
    ];
    const llm = makeLlm(JSON.stringify([{
      isContradiction: true,
      nodeIdA: 'a',
      nodeIdB: 'nonexistent',
      topic: 'test',
      claimA: 'x',
      claimB: 'y',
      severity: 'warning',
      reasoning: 'test',
    }]));

    const detections = await detectAugmented(nodes, [], llm, new Set());
    expect(detections.length).toBe(0);
  });

  it('handles LLM timeout gracefully', async () => {
    const nodes = [
      makeNode('a', 'Doc A', sharedEntities, ['fact']),
      makeNode('b', 'Doc B', sharedEntities, ['fact']),
    ];
    const llm: LLMProvider = {
      complete: vi.fn().mockRejectedValue(new Error('LLM request timed out')),
      stream: vi.fn(),
      getModelId: () => 'test-model',
    };

    const detections = await detectAugmented(nodes, [], llm, new Set());
    expect(detections.length).toBe(0);
  });

  it('returns empty for nodes with no shared entities', async () => {
    const nodes = [
      makeNode('a', 'Doc A', [{ name: 'React', type: 'tech' }], ['fact']),
      makeNode('b', 'Doc B', [{ name: 'Python', type: 'tech' }], ['fact']),
    ];
    const llm = makeLlm('[]');

    const detections = await detectAugmented(nodes, [], llm, new Set());
    expect(detections.length).toBe(0);
    // LLM should not even be called if no packages
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
