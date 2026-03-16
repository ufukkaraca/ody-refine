import { describe, it, expect } from 'vitest';
import { exportNodesToJsonl, exportPreferencePairsToJsonl } from '../src/jsonl.js';
import type { KnowledgeNode, PreferencePair } from '@useody/platform-core';

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: 'node-1',
    title: 'Test Node',
    content: { summary: 'A test node' },
    embedding: [0.1, 0.2],
    embeddingModel: 'test-model',
    embeddingDim: 2,
    confidence: 0.9,
    metadata: { source: 'test' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function makePair(overrides: Partial<PreferencePair> = {}): PreferencePair {
  return {
    prompt: 'What is the policy?',
    chosen: 'Policy A applies.',
    rejected: 'Policy B applies.',
    metadata: {
      conflictType: 'contradiction',
      resolvedBy: 'user-1',
      resolvedAt: new Date('2026-01-03T00:00:00Z'),
      confidence: 0.85,
      sourceNodeIds: ['node-1', 'node-2'],
    },
    ...overrides,
  };
}

describe('exportNodesToJsonl', () => {
  it('returns empty string for empty array', () => {
    expect(exportNodesToJsonl([])).toBe('');
  });

  it('produces one JSON line per node', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b' })];
    const result = exportNodesToJsonl(nodes);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('round-trips node data through JSON parse', () => {
    const node = makeNode();
    const result = exportNodesToJsonl([node]);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['id']).toBe('node-1');
    expect(parsed['title']).toBe('Test Node');
    expect(parsed['confidence']).toBe(0.9);
    expect(parsed['createdAt']).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed['updatedAt']).toBe('2026-01-02T00:00:00.000Z');
  });

  it('filters by confidence when option is set', () => {
    const nodes = [
      makeNode({ id: 'high', confidence: 0.9 }),
      makeNode({ id: 'low', confidence: 0.3 }),
    ];
    const result = exportNodesToJsonl(nodes, {
      format: 'jsonl',
      filterByConfidence: 0.5,
    });
    const lines = result.split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed['id']).toBe('high');
  });

  it('returns empty string when all nodes filtered out', () => {
    const nodes = [makeNode({ confidence: 0.1 })];
    const result = exportNodesToJsonl(nodes, {
      format: 'jsonl',
      filterByConfidence: 0.5,
    });
    expect(result).toBe('');
  });

  it('excludes metadata when includeMetadata is false', () => {
    const node = makeNode({ metadata: { secret: 'value' } });
    const result = exportNodesToJsonl([node], {
      format: 'jsonl',
      includeMetadata: false,
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['metadata']).toBeUndefined();
  });

  it('includes metadata by default', () => {
    const node = makeNode({ metadata: { key: 'val' } });
    const result = exportNodesToJsonl([node]);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['metadata']).toEqual({ key: 'val' });
  });
});

describe('exportPreferencePairsToJsonl', () => {
  it('returns empty string for empty array', () => {
    expect(exportPreferencePairsToJsonl([])).toBe('');
  });

  it('produces one line per pair', () => {
    const pairs = [makePair(), makePair()];
    const result = exportPreferencePairsToJsonl(pairs);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('includes all metadata fields', () => {
    const pair = makePair();
    const result = exportPreferencePairsToJsonl([pair]);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['prompt']).toBe('What is the policy?');
    expect(parsed['chosen']).toBe('Policy A applies.');
    expect(parsed['rejected']).toBe('Policy B applies.');

    const meta = parsed['metadata'] as Record<string, unknown>;
    expect(meta['conflictType']).toBe('contradiction');
    expect(meta['resolvedBy']).toBe('user-1');
    expect(meta['resolvedAt']).toBe('2026-01-03T00:00:00.000Z');
    expect(meta['confidence']).toBe(0.85);
    expect(meta['sourceNodeIds']).toEqual(['node-1', 'node-2']);
  });
});
