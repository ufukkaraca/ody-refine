import { describe, it, expect } from 'vitest';
import { exportTrlDpoToJsonl, exportSftToJsonl } from '../src/trl-adapter.js';
import type { KnowledgeNode, PreferencePair } from '@useody/platform-core';

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: 'node-1',
    title: 'Rate Limiting Policy',
    content: {
      summary: 'All API endpoints are rate limited.',
      facts: ['Limit is 1000 req/min.', 'Burst allowance is 100 req/s.'],
    },
    embedding: [0.1, 0.2],
    embeddingModel: 'test-model',
    embeddingDim: 2,
    confidence: 0.9,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function makePair(overrides: Partial<PreferencePair> = {}): PreferencePair {
  return {
    prompt: 'What is the rate limit?',
    chosen: '1000 requests per minute.',
    rejected: '500 requests per minute.',
    metadata: {
      conflictType: 'contradiction',
      resolvedBy: 'user-1',
      resolvedAt: new Date('2026-01-03T00:00:00Z'),
      confidence: 0.9,
      sourceNodeIds: ['node-1', 'node-2'],
    },
    ...overrides,
  };
}

describe('exportTrlDpoToJsonl', () => {
  it('returns empty string for empty array', () => {
    expect(exportTrlDpoToJsonl([])).toBe('');
  });

  it('produces one line per pair', () => {
    const result = exportTrlDpoToJsonl([makePair(), makePair()]);
    expect(result.split('\n')).toHaveLength(2);
  });

  it('outputs only prompt/chosen/rejected — no metadata field', () => {
    const result = exportTrlDpoToJsonl([makePair()]);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['prompt']).toBe('What is the rate limit?');
    expect(parsed['chosen']).toBe('1000 requests per minute.');
    expect(parsed['rejected']).toBe('500 requests per minute.');
    expect(parsed['metadata']).toBeUndefined();
  });

  it('output is valid JSONL (each line parseable)', () => {
    const result = exportTrlDpoToJsonl([makePair(), makePair()]);
    for (const line of result.split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe('exportSftToJsonl', () => {
  it('returns empty string for empty array', () => {
    expect(exportSftToJsonl([])).toBe('');
  });

  it('produces one line per node', () => {
    const result = exportSftToJsonl([makeNode({ id: 'a' }), makeNode({ id: 'b' })]);
    expect(result.split('\n')).toHaveLength(2);
  });

  it('outputs instruction and response fields', () => {
    const result = exportSftToJsonl([makeNode()]);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['instruction']).toContain('Rate Limiting Policy');
    expect(parsed['response']).toContain('All API endpoints are rate limited.');
    expect(parsed['response']).toContain('Limit is 1000 req/min.');
  });

  it('uses default instruction prefix', () => {
    const result = exportSftToJsonl([makeNode()]);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['instruction']).toMatch(/^Summarize the following topic:/);
  });

  it('uses custom instruction prefix', () => {
    const result = exportSftToJsonl([makeNode()], {
      instructionPrefix: 'What do you know about',
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['instruction']).toMatch(/^What do you know about/);
  });

  it('filters by confidence', () => {
    const nodes = [
      makeNode({ id: 'high', confidence: 0.9 }),
      makeNode({ id: 'low', confidence: 0.2 }),
    ];
    const result = exportSftToJsonl(nodes, { filterByConfidence: 0.5 });
    expect(result.split('\n')).toHaveLength(1);
  });

  it('uses summary only when no facts present', () => {
    const node = makeNode({
      content: { summary: 'Only a summary here.', facts: [] },
    });
    const result = exportSftToJsonl([node]);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['response']).toBe('Only a summary here.');
  });

  it('skips nodes with empty summaries', () => {
    const node = makeNode({ content: { summary: '   ' } });
    expect(exportSftToJsonl([node])).toBe('');
  });
});
