import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectStaleness,
  extractContentDates,
  parseDateRef,
  SIX_MONTHS_MS,
} from '../src/staleness.js';
import type { KnowledgeNode, KnowledgeEdge } from '@useody/platform-core';

// Fixed "now" for deterministic tests: March 15, 2026
const NOW = new Date('2026-03-15T12:00:00Z');

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: crypto.randomUUID(),
    title: 'Test node',
    content: { summary: 'test' },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 0,
    confidence: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('parseDateRef', () => {
  it('parses YYYY-MM', () => {
    const d = parseDateRef('2025-01');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(0);
  });

  it('parses YYYY-MM-DD', () => {
    const d = parseDateRef('2024-06-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getDate()).toBe(15);
  });

  it('parses "Month YYYY"', () => {
    const d = parseDateRef('January 2025');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(0);
  });

  it('returns null for invalid input', () => {
    expect(parseDateRef('not a date')).toBeNull();
  });
});

describe('extractContentDates', () => {
  it('extracts "last updated: Month YYYY"', () => {
    const results = extractContentDates('Last updated: January 2025');
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toContain('January 2025');
  });

  it('extracts "as of YYYY-MM"', () => {
    const results = extractContentDates('as of 2025-01 the system uses Redis');
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toContain('2025-01');
  });

  it('extracts "modified: YYYY-MM-DD"', () => {
    const results = extractContentDates('Modified: 2024-06-15');
    expect(results).toHaveLength(1);
  });

  it('returns empty for no date patterns', () => {
    const results = extractContentDates('no dates here');
    expect(results).toHaveLength(0);
  });
});

describe('SIX_MONTHS_MS', () => {
  it('is approximately 6 months in milliseconds', () => {
    const sixMonthsDays = 6 * 30;
    expect(SIX_MONTHS_MS).toBe(sixMonthsDays * 24 * 60 * 60 * 1000);
  });
});

describe('detectStaleness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('edge-based detection', () => {
    it('detects stale superseded nodes', async () => {
      const older = makeNode({
        title: 'Old policy',
        updatedAt: new Date('2024-01-01'),
      });
      const newer = makeNode({
        title: 'New policy',
        updatedAt: new Date('2024-06-01'),
      });
      const edge: KnowledgeEdge = {
        id: crypto.randomUUID(),
        sourceId: newer.id,
        targetId: older.id,
        type: 'supersedes',
        reason: 'Updated deployment process',
        confidence: 0.9,
        createdAt: new Date('2024-03-01'),
      };

      const results = await detectStaleness([older, newer], [edge]);
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('staleness');
      expect(results[0]!.severity).toBe('warning');
      expect(results[0]!.nodeIds).toEqual([older.id, newer.id]);
    });

    it('skips refreshed nodes', async () => {
      const older = makeNode({
        title: 'Refreshed doc',
        updatedAt: new Date('2024-06-01'),
      });
      const newer = makeNode({ title: 'New doc' });
      const edge: KnowledgeEdge = {
        id: crypto.randomUUID(),
        sourceId: newer.id,
        targetId: older.id,
        type: 'supersedes',
        reason: 'test',
        confidence: 0.9,
        createdAt: new Date('2024-03-01'),
      };

      const results = await detectStaleness([older, newer], [edge]);
      expect(results).toHaveLength(0);
    });

    it('uses source lastModified when available', async () => {
      const older = makeNode({
        title: 'Old doc',
        updatedAt: new Date('2024-01-01'),
        content: {
          summary: 'test',
          source: {
            sourceType: 'notion',
            sourceId: '123',
            lastModified: new Date('2024-06-01'),
          },
        },
      });
      const newer = makeNode({ title: 'New doc' });
      const edge: KnowledgeEdge = {
        id: crypto.randomUUID(),
        sourceId: newer.id,
        targetId: older.id,
        type: 'supersedes',
        reason: 'test',
        confidence: 0.9,
        createdAt: new Date('2024-03-01'),
      };

      const results = await detectStaleness([older, newer], [edge]);
      expect(results).toHaveLength(0);
    });

    it('returns empty for no edges', async () => {
      const node = makeNode();
      const results = await detectStaleness([node], []);
      expect(results).toHaveLength(0);
    });

    it('skips non-supersedes edges', async () => {
      const a = makeNode();
      const b = makeNode();
      const edge: KnowledgeEdge = {
        id: crypto.randomUUID(),
        sourceId: a.id,
        targetId: b.id,
        type: 'related',
        reason: 'test',
        confidence: 0.9,
      };

      const results = await detectStaleness([a, b], [edge]);
      expect(results).toHaveLength(0);
    });
  });

  describe('date-based staleness heuristic', () => {
    it('detects "last updated" older than 6 months', async () => {
      const node = makeNode({
        title: 'Old procedures',
        content: {
          summary: 'Deployment guide',
          raw: 'Last updated: January 2025',
        },
      });

      const results = await detectStaleness([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('staleness');
      expect(results[0]!.severity).toBe('info');
      expect(results[0]!.description).toContain('Last updated: January 2025');
      expect(results[0]!.description).toContain('may be outdated');
    });

    it('detects "as of" older than 6 months', async () => {
      const node = makeNode({
        title: 'Architecture doc',
        content: {
          summary: 'System design',
          raw: 'As of 2025-01 the system uses Redis',
        },
      });

      const results = await detectStaleness([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('info');
      expect(results[0]!.description.toLowerCase()).toContain('as of 2025-01');
    });

    it('detects "modified:" ISO date older than 6 months', async () => {
      const node = makeNode({
        title: 'Config doc',
        content: {
          summary: 'test',
          raw: 'Modified: 2024-06-15',
        },
      });

      const results = await detectStaleness([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('info');
    });

    it('does not flag recent dates', async () => {
      const node = makeNode({
        title: 'Fresh doc',
        content: {
          summary: 'test',
          raw: 'Last updated: February 2026',
        },
      });

      const results = await detectStaleness([node], []);
      expect(results).toHaveLength(0);
    });

    it('does not flag nodes already caught by supersedes edges', async () => {
      const older = makeNode({
        title: 'Superseded doc',
        updatedAt: new Date('2024-01-01'),
        content: {
          summary: 'test',
          raw: 'Last updated: January 2024',
        },
      });
      const newer = makeNode({ title: 'New doc' });
      const edge: KnowledgeEdge = {
        id: crypto.randomUUID(),
        sourceId: newer.id,
        targetId: older.id,
        type: 'supersedes',
        reason: 'Updated',
        confidence: 0.9,
        createdAt: new Date('2024-06-01'),
      };

      const results = await detectStaleness([older, newer], [edge]);
      // Should only have the edge-based detection, not a duplicate
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
    });

    it('detects date in summary when raw is absent', async () => {
      const node = makeNode({
        title: 'Procedures',
        content: {
          summary: 'Last updated: June 2024',
        },
      });

      const results = await detectStaleness([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('info');
    });
  });

  it('has correct preFilter config', () => {
    expect(detectStaleness.preFilter).toEqual({
      similarityThreshold: 0.5,
      topK: 15,
    });
  });
});
