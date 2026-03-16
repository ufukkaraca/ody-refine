// EXCEEDS_LIMIT: comprehensive test fixture coverage
import { describe, it, expect, vi } from 'vitest';
import { detectContradictions } from '../src/contradictions.js';
import type { KnowledgeNode, KnowledgeEdge, LLMProvider } from '@useody/platform-core';

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: crypto.randomUUID(),
    title: 'Test node',
    content: { summary: 'test', facts: [], entities: [] },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 0,
    confidence: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEdge(
  overrides: Partial<KnowledgeEdge> = {},
): KnowledgeEdge {
  return {
    id: crypto.randomUUID(),
    sourceId: '',
    targetId: '',
    type: 'contradicts',
    reason: 'Test contradiction',
    confidence: 0.9,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMockLlm(response: string): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue(response),
    stream: vi.fn(),
    getModelId: vi.fn().mockReturnValue('test-model'),
  };
}

describe('detectContradictions', () => {
  describe('edge-based detection', () => {
    it('detects contradictions from edges', async () => {
      const a = makeNode({ title: 'Policy A' });
      const b = makeNode({ title: 'Policy B' });
      const edge = makeEdge({
        sourceId: a.id,
        targetId: b.id,
        confidence: 0.9,
      });

      const results = await detectContradictions([a, b], [edge]);
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('contradiction');
      expect(results[0]!.severity).toBe('critical');
      expect(results[0]!.nodeIds).toContain(a.id);
      expect(results[0]!.nodeIds).toContain(b.id);
    });

    it('marks low confidence as warning', async () => {
      const a = makeNode({ title: 'Policy A' });
      const b = makeNode({ title: 'Policy B' });
      const edge = makeEdge({
        sourceId: a.id,
        targetId: b.id,
        confidence: 0.5,
      });

      const results = await detectContradictions([a, b], [edge]);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
    });

    it('skips edges referencing unknown nodes', async () => {
      const edge = makeEdge({ sourceId: 'missing', targetId: 'also-missing' });
      const results = await detectContradictions([], [edge]);
      expect(results).toHaveLength(0);
    });
  });

  describe('LLM claim comparison', () => {
    it('detects contradictions via LLM when facts exist', async () => {
      const a = makeNode({
        title: 'pricing-overview.md',
        content: {
          summary: 'pricing overview',
          facts: ['Sandbox API costs $0.05 per core/hour'],
        },
      });
      const b = makeNode({
        title: 'pricing-update.md',
        content: {
          summary: 'pricing update',
          facts: ['Sandbox API costs $3 per hour'],
        },
      });

      const llm = makeMockLlm(JSON.stringify({
        isContradiction: true,
        topic: 'Sandbox API pricing',
        claimA: '$0.05 per core/hour',
        claimB: '$3 per hour',
        severity: 'critical',
        explanation: 'Same API with conflicting hourly rates',
      }));

      const results = await detectContradictions([a, b], [], llm);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('critical');
      expect(results[0]!.description).toContain('Sandbox API pricing');
      expect(results[0]!.description).toContain('$0.05 per core/hour');
      expect(results[0]!.description).toContain('$3 per hour');
      expect(results[0]!.description).toContain('pricing-overview.md');
      expect(results[0]!.description).toContain('pricing-update.md');
    });

    it('does not flag when LLM says no contradiction', async () => {
      const a = makeNode({
        title: 'compute-pricing.md',
        content: {
          summary: 'compute pricing',
          facts: ['vCPU costs $0.05 per core/hour'],
        },
      });
      const b = makeNode({
        title: 'storage-pricing.md',
        content: {
          summary: 'storage pricing',
          facts: ['Disk costs $0.01 per GB/hour'],
        },
      });

      const llm = makeMockLlm(JSON.stringify({
        isContradiction: false,
        topic: 'pricing',
        claimA: 'vCPU costs $0.05/core/hour',
        claimB: 'Disk costs $0.01/GB/hour',
        severity: 'warning',
        explanation: 'Different resources with different pricing',
      }));

      const results = await detectContradictions([a, b], [], llm);
      expect(results).toHaveLength(0);
    });

    it('skips LLM path for nodes without facts', async () => {
      const a = makeNode({
        title: 'Doc A',
        content: { summary: 'no facts here' },
      });
      const b = makeNode({
        title: 'Doc B',
        content: { summary: 'no facts here either' },
      });

      const llm = makeMockLlm('should not be called');

      const results = await detectContradictions([a, b], [], llm);
      expect(results).toHaveLength(0);
      expect(llm.complete).not.toHaveBeenCalled();
    });

    it('handles LLM timeout gracefully', async () => {
      const a = makeNode({
        title: 'Doc A',
        content: { summary: 'test', facts: ['Fact A'] },
      });
      const b = makeNode({
        title: 'Doc B',
        content: { summary: 'test', facts: ['Fact B'] },
      });

      const llm: LLMProvider = {
        complete: vi.fn().mockRejectedValue(new Error('timeout')),
        stream: vi.fn(),
        getModelId: vi.fn().mockReturnValue('test'),
      };

      // Should not throw, completeWithTimeout catches errors
      const results = await detectContradictions([a, b], [], llm);
      // No results since LLM failed (returns empty string)
      expect(results).toHaveLength(0);
    });
  });

  describe('heuristic fallback (no LLM)', () => {
    it('detects shared entities with different facts', async () => {
      const a = makeNode({
        title: 'Auth Service Docs',
        content: {
          summary: 'auth service config',
          facts: ['auth service requires OAuth2', 'token lifetime is 24 hours', 'session policy enforced'],
          entities: [
            { name: 'auth service', type: 'system' },
            { name: 'token lifetime', type: 'config' },
            { name: 'session policy', type: 'config' },
          ],
        },
      });
      const b = makeNode({
        title: 'Security Guide',
        content: {
          summary: 'security config',
          facts: ['auth service requires SAML', 'token lifetime is 1 hour', 'session policy optional'],
          entities: [
            { name: 'auth service', type: 'system' },
            { name: 'token lifetime', type: 'config' },
            { name: 'session policy', type: 'config' },
          ],
        },
      });

      const results = await detectContradictions([a, b], []);
      expect(results.some((r) => r.severity === 'info')).toBe(true);
    });

    it('returns empty for no shared entities', async () => {
      const a = makeNode({ content: { summary: 'x', facts: ['A'] } });
      const b = makeNode({ content: { summary: 'y', facts: ['B'] } });
      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(0);
    });
  });

  describe('number contradiction detection', () => {
    it('detects different numbers with same unit', async () => {
      const a = makeNode({
        title: 'API limits v1',
        content: {
          summary: 'test',
          raw: 'Rate limit is 1000 requests per minute',
        },
      });
      const b = makeNode({
        title: 'API limits v2',
        content: {
          summary: 'test',
          raw: 'Rate limit is 500 requests per minute',
        },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
      expect(results[0]!.description).toContain('1000 requests');
      expect(results[0]!.description).toContain('500 requests');
    });

    it('detects different user counts', async () => {
      const a = makeNode({
        title: 'Team size A',
        content: { summary: 'We have 50 users', raw: '50 users in the system' },
      });
      const b = makeNode({
        title: 'Team size B',
        content: { summary: 'We have 200 users', raw: '200 users in the system' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
    });

    it('does not flag same numbers', async () => {
      const a = makeNode({
        title: 'Doc A',
        content: { summary: 'test', raw: '100 requests per hour' },
      });
      const b = makeNode({
        title: 'Doc B',
        content: { summary: 'test', raw: '100 requests per hour' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(0);
    });

    it('does not flag different units', async () => {
      const a = makeNode({
        title: 'Doc A',
        content: { summary: 'test', raw: '100 requests per hour' },
      });
      const b = makeNode({
        title: 'Doc B',
        content: { summary: 'test', raw: '50 days' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(0);
    });

    it('does not flag different prices for different resources', async () => {
      const a = makeNode({
        title: 'vCPU cores',
        content: { summary: 'compute resource', raw: 'vCPU costs $0.05 per core/hour' },
      });
      const b = makeNode({
        title: 'Disk quota',
        content: { summary: 'storage resource', raw: 'Disk costs $0.01 per GB/hour' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(0);
    });

    it('does not flag when same sentence appears in both nodes', async () => {
      const sentence = 'The service processes 1000 requests per minute';
      const a = makeNode({
        title: 'Onboarding guide',
        content: { summary: 'test', raw: sentence },
      });
      const b = makeNode({
        title: 'API reference',
        content: { summary: 'test', raw: sentence },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(0);
    });

    it('still flags same resource with genuinely different numbers', async () => {
      const a = makeNode({
        title: 'Pricing v1',
        content: { summary: 'test', raw: 'Compute costs $0.05 per core/hour' },
      });
      const b = makeNode({
        title: 'Pricing v2',
        content: { summary: 'test', raw: 'Compute costs $0.10 per core/hour' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
    });
  });

  describe('boolean contradiction detection', () => {
    it('detects remote-first vs office requirement', async () => {
      const a = makeNode({
        title: 'Work policy',
        content: { summary: 'We are remote-first', raw: 'We are remote-first' },
      });
      const b = makeNode({
        title: 'Office policy',
        content: {
          summary: 'In office Monday',
          raw: 'Everyone in office Monday and Wednesday',
        },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
      expect(results[0]!.description).toContain('remote-first');
      expect(results[0]!.description).toContain('office');
    });

    it('does not flag required/optional heuristically (too noisy)', async () => {
      const a = makeNode({
        title: 'Code Review Policy A',
        content: { summary: 'Code review is required', raw: 'Code review is required' },
      });
      const b = makeNode({
        title: 'Code Review Policy B',
        content: { summary: 'Code review is optional', raw: 'Code review is optional' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(0);
    });

    it('does not flag mandatory/not-required heuristically (too noisy)', async () => {
      const a = makeNode({
        title: 'Policy A',
        content: { summary: 'test', raw: 'Training is mandatory for all staff' },
      });
      const b = makeNode({
        title: 'Policy B',
        content: { summary: 'test', raw: 'Training is not required' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(0);
    });

    it('detects deprecated vs current', async () => {
      const a = makeNode({
        title: 'API endpoint docs',
        content: { summary: 'test', raw: 'This endpoint is deprecated' },
      });
      const b = makeNode({
        title: 'API endpoint guide',
        content: { summary: 'test', raw: 'This endpoint is currently supported' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.description).toContain('deprecated');
    });

    it('does not flag unrelated content', async () => {
      const a = makeNode({
        title: 'Doc A',
        content: { summary: 'We use TypeScript', raw: 'We use TypeScript' },
      });
      const b = makeNode({
        title: 'Doc B',
        content: { summary: 'We use pnpm', raw: 'We use pnpm' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(0);
    });
  });

  describe('deduplication', () => {
    it('does not produce duplicate when edge and heuristic both match', async () => {
      const a = makeNode({ title: 'Work policy', content: { summary: 'We are remote-first', raw: 'We are remote-first' } });
      const b = makeNode({ title: 'Office policy', content: { summary: 'In office Monday', raw: 'Everyone in office Monday' } });
      const edge = makeEdge({ sourceId: a.id, targetId: b.id, confidence: 0.9 });

      const results = await detectContradictions([a, b], [edge]);
      expect(results).toHaveLength(1);
    });

    it('produces at most one detection per node pair from heuristics', async () => {
      const a = makeNode({
        title: 'Policy A',
        content: { summary: 'remote-first, 100 users', raw: 'We are remote-first with 100 users' },
      });
      const b = makeNode({
        title: 'Policy B',
        content: { summary: 'office, 50 users', raw: 'Everyone in office Monday with 50 users' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(1);
    });
  });

  it('returns empty for no nodes', async () => {
    const results = await detectContradictions([], []);
    expect(results).toHaveLength(0);
  });

  it('has correct preFilter config', () => {
    expect(detectContradictions.preFilter).toEqual({
      similarityThreshold: 0.6,
      topK: 10,
    });
  });
});
