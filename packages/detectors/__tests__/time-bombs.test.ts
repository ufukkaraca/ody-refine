// EXCEEDS_LIMIT: test fixture coverage for deadline patterns
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectTimeBombs, extractDeadlines, classifyDeadline } from '../src/time-bombs.js';
import type { KnowledgeNode, LLMProvider } from '@useody/platform-core';

// Fixed "now" for deterministic tests: March 15, 2026
const NOW = new Date('2026-03-15T12:00:00Z');

function makeNode(
  title: string,
  facts: string[] = [],
  summary = '',
  raw = '',
): KnowledgeNode {
  return {
    id: crypto.randomUUID(),
    title,
    content: { summary: summary || title, facts, raw },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 0,
    confidence: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
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

describe('extractDeadlines', () => {
  it('parses Q[1-4] YYYY patterns', () => {
    const results = extractDeadlines('Complete by Q2 2025', NOW);
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('Q2 2025');
    // Q2 2025 ends June 30, 2025
    expect(results[0]!.endDate.getFullYear()).toBe(2025);
    expect(results[0]!.endDate.getMonth()).toBe(5); // June (0-indexed)
  });

  it('parses YYYY-MM patterns', () => {
    const results = extractDeadlines('expires 2025-06', NOW);
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('2025-06');
    expect(results[0]!.endDate.getMonth()).toBe(5);
  });

  it('parses "by Month YYYY" patterns', () => {
    const results = extractDeadlines('by March 2025', NOW);
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toMatch(/by March 2025/i);
  });

  it('parses "by end of month"', () => {
    const results = extractDeadlines('due by end of month', NOW);
    expect(results).toHaveLength(1);
    // End of March 2026
    expect(results[0]!.endDate.getMonth()).toBe(2);
    expect(results[0]!.endDate.getFullYear()).toBe(2026);
  });

  it('parses "by end of year"', () => {
    const results = extractDeadlines('target by end of year', NOW);
    expect(results).toHaveLength(1);
    expect(results[0]!.endDate.getMonth()).toBe(11);
    expect(results[0]!.endDate.getFullYear()).toBe(2026);
  });

  it('extracts multiple deadlines', () => {
    const results = extractDeadlines('Q1 2025 and Q4 2027 targets', NOW);
    expect(results).toHaveLength(2);
  });

  it('returns empty for no date patterns', () => {
    const results = extractDeadlines('no dates here', NOW);
    expect(results).toHaveLength(0);
  });
});

describe('classifyDeadline', () => {
  const nodeId = 'test-node';
  const nowLabel = '2026-03-15';

  it('classifies past deadlines as warning/expired', () => {
    const dl = { label: 'Q2 2025', endDate: new Date(2025, 5, 30) };
    const det = classifyDeadline(dl, NOW, nodeId, nowLabel);
    expect(det!.severity).toBe('warning');
    expect(det!.metadata?.expired).toBe(true);
    expect(det!.description).toContain('has passed');
  });

  it('classifies approaching deadlines as warning', () => {
    // April 10 2026 is ~26 days from March 15 2026
    const dl = { label: '2026-04', endDate: new Date(2026, 3, 10) };
    const det = classifyDeadline(dl, NOW, nodeId, nowLabel);
    expect(det!.severity).toBe('warning');
    expect(det!.metadata?.expired).toBe(false);
    expect(det!.description).toContain('approaching');
  });

  it('classifies future deadlines as info', () => {
    const dl = { label: 'Q4 2027', endDate: new Date(2027, 11, 31) };
    const det = classifyDeadline(dl, NOW, nodeId, nowLabel);
    expect(det!.severity).toBe('info');
    expect(det!.description).toContain('Future deadline');
  });
});

describe('detectTimeBombs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('with LLM', () => {
    it('detects expired deadline via LLM', async () => {
      const node = makeNode('Migration deadline', ['Complete by Q1 2024']);
      const llm = makeMockLlm(
        JSON.stringify({
          hasTimeBomb: true,
          deadline: 'Q1 2024',
          expired: true,
          description: 'Migration deadline Q1 2024 has passed.',
        }),
      );

      const results = await detectTimeBombs([node], [], llm);
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('time_bomb');
      expect(results[0]!.severity).toBe('critical');
      expect(results[0]!.metadata?.expired).toBe(true);
    });

    it('detects upcoming deadline via LLM', async () => {
      const node = makeNode('Renewal', ['expires 2027-06']);
      const llm = makeMockLlm(
        JSON.stringify({
          hasTimeBomb: true,
          deadline: '2027-06',
          expired: false,
          description: 'License renewal approaching.',
        }),
      );

      const results = await detectTimeBombs([node], [], llm);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
      expect(results[0]!.metadata?.expired).toBe(false);
    });

    it('handles LLM parse failure gracefully', async () => {
      const node = makeNode('Deadline Q1 2025', ['by Q1 2025']);
      const llm = makeMockLlm('Sorry, I cannot help with that.');
      const results = await detectTimeBombs([node], [], llm);
      expect(results).toHaveLength(0);
    });

    it('handles LLM returning hasTimeBomb false', async () => {
      const node = makeNode('Deadline check', ['expires 2025-12']);
      const llm = makeMockLlm(
        JSON.stringify({
          hasTimeBomb: false,
          deadline: null,
          expired: false,
          description: '',
        }),
      );
      const results = await detectTimeBombs([node], [], llm);
      expect(results).toHaveLength(0);
    });
  });

  it('skips nodes without date patterns', async () => {
    const node = makeNode('General policy', ['Use REST APIs']);
    const results = await detectTimeBombs([node], []);
    expect(results).toHaveLength(0);
  });

  describe('without LLM — date parsing', () => {
    it('detects expired quarter deadline as warning', async () => {
      const node = makeNode('Migration', ['Complete by Q2 2025']);
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
      expect(results[0]!.description).toContain('Q2 2025');
      expect(results[0]!.description).toContain('has passed');
      expect(results[0]!.metadata?.expired).toBe(true);
    });

    it('detects expired YYYY-MM deadline as warning', async () => {
      const node = makeNode('License renewal', [], 'expires 2025-06');
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
      expect(results[0]!.description).toContain('2025-06');
      expect(results[0]!.metadata?.expired).toBe(true);
    });

    it('detects approaching deadline within 30 days as warning', async () => {
      // 2026-03 ends March 31, which is 16 days from March 15 → within 30 days
      const node = makeNode('Review', [], 'deadline 2026-03');
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
      expect(results[0]!.description).toContain('approaching');
      expect(results[0]!.metadata?.expired).toBe(false);
    });

    it('detects future deadline as info', async () => {
      const node = makeNode('Future plan', ['Q4 2027 target']);
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('info');
      expect(results[0]!.description).toContain('Future deadline');
    });

    it('parses "by March 2025" as expired', async () => {
      const node = makeNode('Commitment', [], 'by March 2025');
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
      expect(results[0]!.metadata?.expired).toBe(true);
    });

    it('parses "by end of month" relative to now', async () => {
      const node = makeNode('Task', [], 'due by end of month');
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(1);
      // End of March 2026 is within 30 days
      expect(results[0]!.severity).toBe('warning');
    });

    it('parses "by end of year" relative to now', async () => {
      const node = makeNode('Goal', [], 'target by end of year');
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('info');
    });

    it('emits nothing in heuristic mode for date keywords with no parseable date', async () => {
      // The heuristic "contains date keywords but no parseable deadline" catch-all was removed
      // because it is too broad without LLM context (produces noisy info-level detections).
      const node = makeNode('Some deadline', [], 'the deadline is soon');
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(0);
    });

    it('extracts dates from raw content', async () => {
      const node = makeNode('Doc', [], 'some doc', 'Must complete by Q1 2025');
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('warning');
      expect(results[0]!.metadata?.expired).toBe(true);
    });

    it('detects multiple deadlines in one node', async () => {
      const node = makeNode('Plan', ['Q1 2025 and Q4 2027 targets']);
      const results = await detectTimeBombs([node], []);
      expect(results).toHaveLength(2);
      const severities = results.map((r) => r.severity);
      expect(severities).toContain('warning'); // Q1 2025 expired
      expect(severities).toContain('info'); // Q4 2027 future
    });
  });

  it('has requireAllNodes in preFilter', () => {
    expect(detectTimeBombs.preFilter).toEqual({
      similarityThreshold: 0,
      topK: 0,
      requireAllNodes: true,
    });
  });
});
