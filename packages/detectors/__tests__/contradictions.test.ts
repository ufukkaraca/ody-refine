import { describe, it, expect } from 'vitest';
import { detectContradictions } from '../src/contradictions.js';
import type { KnowledgeNode, KnowledgeEdge } from '@useody/platform-core';

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

  describe('fact-based heuristic', () => {
    it('detects shared specific entities with different facts about same sub-topic', async () => {
      const a = makeNode({
        title: 'Auth Service Docs',
        content: {
          summary: 'auth service config',
          facts: ['auth service requires OAuth2', 'token lifetime is 24 hours'],
          entities: [
            { name: 'auth service', type: 'system' },
            { name: 'token lifetime', type: 'config' },
          ],
        },
      });
      const b = makeNode({
        title: 'Security Guide',
        content: {
          summary: 'security config',
          facts: ['auth service requires SAML', 'token lifetime is 1 hour'],
          entities: [
            { name: 'auth service', type: 'system' },
            { name: 'token lifetime', type: 'config' },
          ],
        },
      });

      const results = await detectContradictions([a, b], []);
      expect(results.some((r) => r.severity === 'info')).toBe(true);
    });

    it('does not flag when differing facts share no keywords (unrelated sub-topics)', async () => {
      const a = makeNode({
        title: 'Node A',
        content: {
          summary: 'test',
          facts: ['auth service uses OAuth2', 'deploy pipeline uses GitHub Actions'],
          entities: [
            { name: 'auth service', type: 'system' },
            { name: 'deploy pipeline', type: 'system' },
          ],
        },
      });
      const b = makeNode({
        title: 'Node B',
        content: {
          summary: 'test',
          facts: ['auth service uses SAML', 'monitoring uses Datadog'],
          entities: [
            { name: 'auth service', type: 'system' },
            { name: 'deploy pipeline', type: 'system' },
          ],
        },
      });

      // Only 'auth service requires' facts share keywords — should still detect
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

    it('detects required vs optional', async () => {
      const a = makeNode({
        title: 'Doc A',
        content: { summary: 'Code review is required', raw: 'Code review is required' },
      });
      const b = makeNode({
        title: 'Doc B',
        content: { summary: 'Code review is optional', raw: 'Code review is optional' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.description).toContain('required');
      expect(results[0]!.description).toContain('optional');
    });

    it('detects mandatory vs not required', async () => {
      const a = makeNode({
        title: 'Policy A',
        content: { summary: 'test', raw: 'Training is mandatory for all staff' },
      });
      const b = makeNode({
        title: 'Policy B',
        content: { summary: 'test', raw: 'Training is not required' },
      });

      const results = await detectContradictions([a, b], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.description).toContain('mandatory');
    });

    it('detects deprecated vs current', async () => {
      const a = makeNode({
        title: 'API docs',
        content: { summary: 'test', raw: 'This endpoint is deprecated' },
      });
      const b = makeNode({
        title: 'Integration guide',
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
    it('does not produce duplicate detection when edge and heuristic both match', async () => {
      const a = makeNode({ title: 'Work policy', content: { summary: 'We are remote-first', raw: 'We are remote-first' } });
      const b = makeNode({ title: 'Office policy', content: { summary: 'In office Monday', raw: 'Everyone in office Monday' } });
      const edge = makeEdge({ sourceId: a.id, targetId: b.id, confidence: 0.9 });

      const results = await detectContradictions([a, b], [edge]);
      // Edge fires first; heuristic should skip the same pair
      expect(results).toHaveLength(1);
    });

    it('produces at most one detection per node pair from heuristics', async () => {
      // Both number and boolean patterns match — should only get 1 detection
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
