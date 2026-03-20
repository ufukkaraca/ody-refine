import { describe, it, expect, vi } from 'vitest';
import type { KnowledgeNode, LLMProvider, Detection } from '@useody/platform-core';
import { detectClaimContradictions } from '../src/claim-comparison.js';

function makeNode(
  id: string,
  title: string,
  facts: string[],
): KnowledgeNode {
  return {
    id,
    title,
    content: {
      summary: facts.join('. '),
      facts,
    },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 0,
    confidence: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeLlm(response: string): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue(response),
    stream: vi.fn(),
    getModelId: vi.fn().mockReturnValue('test-model'),
  };
}

describe('detectClaimContradictions', () => {
  it('detects contradiction when LLM reports one', async () => {
    const nodeA = makeNode('n1', 'API Guide', [
      'Rate limit is 1000 requests per minute',
    ]);
    const nodeB = makeNode('n2', 'Developer Docs', [
      'Rate limit is 500 requests per minute',
    ]);

    const llmResponse = JSON.stringify({
      isContradiction: true,
      topic: 'API rate limit',
      claimA: '1000 requests per minute',
      claimB: '500 requests per minute',
      severity: 'critical',
      explanation: 'Conflicting rate limit numbers',
    });

    const llm = makeLlm(llmResponse);
    const out: Detection[] = [];
    const seen = new Set<string>();

    await detectClaimContradictions([nodeA, nodeB], llm, out, seen);

    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('contradiction');
    expect(out[0]!.severity).toBe('critical');
    expect(out[0]!.nodeIds).toEqual(['n1', 'n2']);
    expect(out[0]!.description).toContain('API rate limit');
    expect(out[0]!.description).toContain('1000 requests');
    expect(out[0]!.description).toContain('500 requests');
  });

  it('does not report when LLM says no contradiction', async () => {
    const nodeA = makeNode('n1', 'Guide A', ['We use TypeScript']);
    const nodeB = makeNode('n2', 'Guide B', ['We use ESLint']);

    const llmResponse = JSON.stringify({
      isContradiction: false,
      topic: 'tooling',
      claimA: 'TypeScript',
      claimB: 'ESLint',
      severity: 'warning',
      explanation: 'Complementary tools, not contradictory',
    });

    const llm = makeLlm(llmResponse);
    const out: Detection[] = [];
    const seen = new Set<string>();

    await detectClaimContradictions([nodeA, nodeB], llm, out, seen);

    expect(out).toHaveLength(0);
  });

  it('skips nodes without extracted facts', async () => {
    const nodeA = makeNode('n1', 'Guide', []);
    const nodeB = makeNode('n2', 'Docs', ['Rate limit is 500']);

    const llm = makeLlm('{}');
    const out: Detection[] = [];
    const seen = new Set<string>();

    await detectClaimContradictions([nodeA, nodeB], llm, out, seen);

    // LLM should never be called — only 1 node with facts
    expect(llm.complete).not.toHaveBeenCalled();
    expect(out).toHaveLength(0);
  });

  it('requires at least 2 nodes with facts', async () => {
    const single = makeNode('n1', 'Lone doc', ['Only one node with facts']);

    const llm = makeLlm('{}');
    const out: Detection[] = [];
    const seen = new Set<string>();

    await detectClaimContradictions([single], llm, out, seen);

    expect(llm.complete).not.toHaveBeenCalled();
    expect(out).toHaveLength(0);
  });

  it('deduplicates pairs using seen set', async () => {
    const nodeA = makeNode('n1', 'Guide A', ['Rate limit: 1000']);
    const nodeB = makeNode('n2', 'Guide B', ['Rate limit: 500']);

    const llmResponse = JSON.stringify({
      isContradiction: true,
      topic: 'Rate limit',
      claimA: '1000',
      claimB: '500',
      severity: 'warning',
      explanation: 'Different numbers',
    });

    const llm = makeLlm(llmResponse);
    const out: Detection[] = [];
    const seen = new Set<string>();

    // Run twice — second should be deduplicated
    await detectClaimContradictions([nodeA, nodeB], llm, out, seen);
    await detectClaimContradictions([nodeA, nodeB], llm, out, seen);

    expect(out).toHaveLength(1);
  });

  it('handles LLM returning empty response gracefully', async () => {
    const nodeA = makeNode('n1', 'A', ['Fact A']);
    const nodeB = makeNode('n2', 'B', ['Fact B']);

    const llm: LLMProvider = {
      complete: vi.fn().mockResolvedValue(''),
      stream: vi.fn(),
      getModelId: vi.fn().mockReturnValue('test'),
    };

    const out: Detection[] = [];
    const seen = new Set<string>();

    await detectClaimContradictions([nodeA, nodeB], llm, out, seen);

    expect(out).toHaveLength(0);
  });

  it('handles LLM returning invalid JSON gracefully', async () => {
    const nodeA = makeNode('n1', 'A', ['Fact A']);
    const nodeB = makeNode('n2', 'B', ['Fact B']);

    const llm = makeLlm('this is not json');
    const out: Detection[] = [];
    const seen = new Set<string>();

    await detectClaimContradictions([nodeA, nodeB], llm, out, seen);

    expect(out).toHaveLength(0);
  });

  it('normalizes severity to warning when not critical', async () => {
    const nodeA = makeNode('n1', 'A', ['Fact A']);
    const nodeB = makeNode('n2', 'B', ['Fact B']);

    const llmResponse = JSON.stringify({
      isContradiction: true,
      topic: 'Something',
      claimA: 'Claim A',
      claimB: 'Claim B',
      severity: 'warning',
      explanation: 'Minor conflict',
    });

    const llm = makeLlm(llmResponse);
    const out: Detection[] = [];
    const seen = new Set<string>();

    await detectClaimContradictions([nodeA, nodeB], llm, out, seen);

    expect(out[0]!.severity).toBe('warning');
  });

  it('populates metadata with claim details', async () => {
    const nodeA = makeNode('n1', 'Doc A', ['Fact X']);
    const nodeB = makeNode('n2', 'Doc B', ['Fact Y']);

    const llmResponse = JSON.stringify({
      isContradiction: true,
      topic: 'Widget config',
      claimA: 'X is 10',
      claimB: 'X is 20',
      severity: 'critical',
      explanation: 'Numbers differ',
    });

    const llm = makeLlm(llmResponse);
    const out: Detection[] = [];
    const seen = new Set<string>();

    await detectClaimContradictions([nodeA, nodeB], llm, out, seen);

    expect(out[0]!.metadata).toBeDefined();
    expect(out[0]!.metadata!['claimA']).toBe('X is 10');
    expect(out[0]!.metadata!['claimB']).toBe('X is 20');
    expect(out[0]!.metadata!['topic']).toBe('Widget config');
    expect(out[0]!.metadata!['impact']).toBe('Numbers differ');
  });
});
