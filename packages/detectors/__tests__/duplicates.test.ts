import { describe, it, expect } from 'vitest';
import { detectDuplicates } from '../src/duplicates.js';
import type { KnowledgeNode, KnowledgeEdge, LLMProvider } from '@useody/platform-core';

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: crypto.randomUUID(),
    title: 'Test node',
    content: { summary: 'test', facts: ['fact1'] },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 0,
    confidence: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockLlm(response: string): LLMProvider {
  return {
    complete: async () => response,
    stream: async function* (): AsyncGenerator<string, void, unknown> {
      yield '';
    },
    getModelId: () => 'mock',
  };
}

describe('detectDuplicates', () => {
  it('detects split truth when nodes share tokens and LLM confirms', async () => {
    const a = makeNode({
      title: 'API rate limit policy',
      content: { summary: 'rate limits', facts: ['Rate limit is 1000 req/s'] },
    });
    const b = makeNode({
      title: 'API rate limit config',
      content: { summary: 'rate limits', facts: ['Rate limit is 500 req/s'] },
    });

    const llm = makeMockLlm(
      JSON.stringify({
        splitTruth: true,
        conflictA: 'Rate limit is 1000 req/s',
        conflictB: 'Rate limit is 500 req/s',
        explanation: 'Conflicting rate limit values',
      }),
    );

    const results = await detectDuplicates([a, b], [], llm);
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe('duplicate');
    expect(results[0]!.severity).toBe('warning');
    expect(results[0]!.description).toContain('1000');
    expect(results[0]!.description).toContain('500');
  });

  it('skips pairs with no shared tokens (different topics)', async () => {
    const a = makeNode({
      title: 'Database migration guide',
      content: { summary: 'db', facts: ['PostgreSQL upgrade to v15'] },
    });
    const b = makeNode({
      title: 'Marketing launch plan',
      content: { summary: 'marketing', facts: ['Launch campaign in Q3'] },
    });

    const callCount = { value: 0 };
    const llm: LLMProvider = {
      complete: async () => {
        callCount.value++;
        return JSON.stringify({ splitTruth: true, explanation: 'x' });
      },
      stream: async function* (): AsyncGenerator<string, void, unknown> {
        yield '';
      },
      getModelId: () => 'mock',
    };

    const results = await detectDuplicates([a, b], [], llm);
    expect(results).toHaveLength(0);
    expect(callCount.value).toBe(0);
  });

  it('skips pairs with existing edges', async () => {
    const a = makeNode({
      title: 'Deploy process',
      content: { summary: 'deploy', facts: ['Deploy via CI'] },
    });
    const b = makeNode({
      title: 'Deploy config',
      content: { summary: 'deploy', facts: ['Deploy via CD'] },
    });
    const edge: KnowledgeEdge = {
      id: crypto.randomUUID(),
      sourceId: a.id,
      targetId: b.id,
      type: 'related',
      reason: 'test',
      confidence: 1,
    };

    const llm = makeMockLlm(
      JSON.stringify({ splitTruth: true, explanation: 'x' }),
    );

    const results = await detectDuplicates([a, b], [edge], llm);
    expect(results).toHaveLength(0);
  });

  it('returns empty when no LLM provided', async () => {
    const a = makeNode();
    const b = makeNode();
    const results = await detectDuplicates([a, b], []);
    expect(results).toHaveLength(0);
  });

  it('skips pairs where both have no facts', async () => {
    const a = makeNode({ content: { summary: 'x', facts: [] } });
    const b = makeNode({ content: { summary: 'y', facts: [] } });

    const llm = makeMockLlm(
      JSON.stringify({ splitTruth: true, explanation: 'x' }),
    );

    const results = await detectDuplicates([a, b], [], llm);
    expect(results).toHaveLength(0);
  });

  it('handles non-JSON LLM response gracefully', async () => {
    const a = makeNode({
      title: 'API rate limit',
      content: { summary: 'api', facts: ['Rate limit is 1000'] },
    });
    const b = makeNode({
      title: 'API rate config',
      content: { summary: 'api', facts: ['Rate limit is 500'] },
    });

    const llm = makeMockLlm('I cannot determine this.');

    const results = await detectDuplicates([a, b], [], llm);
    expect(results).toHaveLength(0);
  });

  it('handles LLM timeout (empty response)', async () => {
    const a = makeNode({
      title: 'Deploy process',
      content: { summary: 'deploy', facts: ['Deploy via CI'] },
    });
    const b = makeNode({
      title: 'Deploy config',
      content: { summary: 'deploy', facts: ['Deploy via CD'] },
    });

    const llm: LLMProvider = {
      complete: async () => {
        throw new Error('timeout');
      },
      stream: async function* (): AsyncGenerator<string, void, unknown> {
        yield '';
      },
      getModelId: () => 'mock',
    };

    const results = await detectDuplicates([a, b], [], llm);
    expect(results).toHaveLength(0);
  });

  it('has correct preFilter config', () => {
    expect(detectDuplicates.preFilter).toEqual({
      similarityThreshold: 0.75,
      topK: 5,
    });
  });

  it('uses explanation as fallback when conflictA/B not provided', async () => {
    const a = makeNode({
      title: 'Deploy process',
      content: { summary: 'deploy', facts: ['Deploy uses Jenkins'] },
    });
    const b = makeNode({
      title: 'Deploy setup',
      content: { summary: 'deploy', facts: ['Deploy uses GitHub Actions'] },
    });

    const llm = makeMockLlm(
      JSON.stringify({
        splitTruth: true,
        explanation: 'Different CI systems referenced',
      }),
    );

    const results = await detectDuplicates([a, b], [], llm);
    expect(results).toHaveLength(1);
    expect(results[0]!.description).toBe('Different CI systems referenced');
  });

  it('does not duplicate same pair', async () => {
    const a = makeNode({
      title: 'API rate limit',
      content: { summary: 'api', facts: ['Rate limit 1000'] },
    });
    const b = makeNode({
      title: 'API rate config',
      content: { summary: 'api', facts: ['Rate limit 500'] },
    });

    const llm = makeMockLlm(
      JSON.stringify({
        splitTruth: true,
        conflictA: '1000',
        conflictB: '500',
        explanation: 'Conflicting rates',
      }),
    );

    // Pass same two nodes — should only get one detection
    const results = await detectDuplicates([a, b], [], llm);
    expect(results).toHaveLength(1);
  });
});
