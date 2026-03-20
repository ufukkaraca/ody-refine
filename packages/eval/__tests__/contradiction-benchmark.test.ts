import { describe, it, expect } from 'vitest';
import {
  generateContradictionBenchmark,
  generateScenariosFromNodes,
} from '../src/contradiction-benchmark.js';
import {
  calculateNgramOverlap,
  calculateResolutionRate,
} from '../src/metrics.js';
import type { PreferencePair, KnowledgeNode } from '@useody/platform-core';

function makePair(overrides: Partial<PreferencePair> = {}): PreferencePair {
  return {
    prompt: 'What is the remote work policy?',
    chosen: 'Employees can work remotely 3 days per week.',
    rejected: 'All employees must work from the office full time.',
    metadata: {
      conflictType: 'contradiction',
      resolvedBy: 'test-user',
      resolvedAt: new Date(),
      confidence: 1.0,
      sourceNodeIds: ['node-1', 'node-2'],
    },
    ...overrides,
  };
}

function makeNode(id: string, title: string, summary: string): KnowledgeNode {
  return {
    id,
    title,
    content: { summary, facts: [summary], entities: [] },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 0,
    confidence: 1.0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('generateContradictionBenchmark', () => {
  it('creates benchmark items from preference pairs', () => {
    const pairs = [makePair(), makePair({ prompt: 'What is the vacation policy?' })];
    const benchmark = generateContradictionBenchmark(pairs, 'test-bench');

    expect(benchmark.name).toBe('test-bench');
    expect(benchmark.items).toHaveLength(2);
    expect(benchmark.items[0]!.difficulty).toBe('hard');
    expect(benchmark.items[0]!.question).toContain('Document A');
    expect(benchmark.items[0]!.question).toContain('Document B');
    expect(benchmark.items[0]!.expectedAnswer).toBe(pairs[0]!.chosen);
  });

  it('handles empty pairs array', () => {
    const benchmark = generateContradictionBenchmark([], 'empty');
    expect(benchmark.items).toHaveLength(0);
  });
});

describe('generateScenariosFromNodes', () => {
  it('creates scenarios from contradicting nodes', () => {
    const nodes = [
      makeNode('a', 'Remote Policy', 'Work remotely 3 days per week'),
      makeNode('b', 'Remote Policy', 'Must work from office full time'),
    ];
    const scenarios = generateScenariosFromNodes(nodes, [
      { nodeA: 'a', nodeB: 'b', correctNodeId: 'a' },
    ]);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]!.correctAnswer).toBe('Work remotely 3 days per week');
    expect(scenarios[0]!.incorrectAnswer).toBe('Must work from office full time');
  });

  it('skips scenarios with missing nodes', () => {
    const scenarios = generateScenariosFromNodes([], [
      { nodeA: 'x', nodeB: 'y', correctNodeId: 'x' },
    ]);
    expect(scenarios).toHaveLength(0);
  });
});

describe('calculateNgramOverlap', () => {
  it('returns 1 for identical strings', () => {
    const text = 'The policy allows remote work three days per week';
    expect(calculateNgramOverlap(text, text)).toBeCloseTo(1);
  });

  it('returns high score for paraphrases', () => {
    const a = 'Employees can work remotely three days per week';
    const b = 'Staff may work remotely up to three days per week';
    expect(calculateNgramOverlap(a, b)).toBeGreaterThan(0.5);
  });

  it('returns low score for unrelated text', () => {
    expect(calculateNgramOverlap('alpha beta gamma', 'one two three')).toBe(0);
  });

  it('returns 1 for empty expected', () => {
    expect(calculateNgramOverlap('', 'anything')).toBe(1);
  });
});

describe('calculateResolutionRate', () => {
  it('returns 1 when model always picks chosen', () => {
    const items = [
      { modelAnswer: 'remote work is allowed for employees', chosen: 'remote work is allowed for all employees', rejected: 'office attendance is mandatory every day' },
      { modelAnswer: 'the budget is fifty thousand dollars', chosen: 'the project budget is fifty thousand dollars', rejected: 'the project has zero budget allocation' },
    ];
    expect(calculateResolutionRate(items)).toBe(1);
  });

  it('returns 0 when model always picks rejected', () => {
    const items = [
      { modelAnswer: 'no remote work ever', chosen: 'remote work is allowed', rejected: 'no remote work ever allowed' },
    ];
    expect(calculateResolutionRate(items)).toBe(0);
  });

  it('returns 0 for empty items', () => {
    expect(calculateResolutionRate([])).toBe(0);
  });
});
