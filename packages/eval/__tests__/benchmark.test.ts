import { describe, it, expect } from 'vitest';
import type { KnowledgeNode } from '@useody/platform-core';
import { generateBenchmark } from '../src/benchmark.js';

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: crypto.randomUUID(),
    title: 'Test Node',
    content: {
      summary: 'A test summary',
      facts: ['fact one', 'fact two'],
      entities: [{ name: 'TestEntity', type: 'component' }],
    },
    embedding: [0.1, 0.2],
    embeddingModel: 'test-model',
    embeddingDim: 2,
    confidence: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('generateBenchmark', () => {
  it('creates items from qualifying nodes', () => {
    const nodes = [makeNode(), makeNode()];
    const benchmark = generateBenchmark(nodes, 'test-bench');

    expect(benchmark.name).toBe('test-bench');
    expect(benchmark.items).toHaveLength(2);
    expect(benchmark.datasetVersion).toBe('1.0.0');
  });

  it('skips nodes with confidence < 0.8', () => {
    const nodes = [makeNode({ confidence: 0.5 }), makeNode({ confidence: 0.9 })];
    const benchmark = generateBenchmark(nodes, 'filtered');
    expect(benchmark.items).toHaveLength(1);
  });

  it('skips nodes with no facts', () => {
    const nodes = [
      makeNode({ content: { summary: 'No facts here', facts: [] } }),
      makeNode(),
    ];
    const benchmark = generateBenchmark(nodes, 'filtered');
    expect(benchmark.items).toHaveLength(1);
  });

  it('skips nodes with undefined facts', () => {
    const nodes = [
      makeNode({ content: { summary: 'No facts field' } }),
      makeNode(),
    ];
    const benchmark = generateBenchmark(nodes, 'filtered');
    expect(benchmark.items).toHaveLength(1);
  });

  it('assigns easy difficulty for 1-2 facts', () => {
    const node = makeNode({
      content: { summary: 's', facts: ['f1'] },
    });
    const benchmark = generateBenchmark([node], 'diff');
    expect(benchmark.items[0].difficulty).toBe('easy');
  });

  it('assigns medium difficulty for 3-5 facts', () => {
    const node = makeNode({
      content: { summary: 's', facts: ['f1', 'f2', 'f3', 'f4'] },
    });
    const benchmark = generateBenchmark([node], 'diff');
    expect(benchmark.items[0].difficulty).toBe('medium');
  });

  it('assigns hard difficulty for 6+ facts', () => {
    const node = makeNode({
      content: {
        summary: 's',
        facts: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
      },
    });
    const benchmark = generateBenchmark([node], 'diff');
    expect(benchmark.items[0].difficulty).toBe('hard');
  });

  it('derives domain from first entity type', () => {
    const node = makeNode({
      content: {
        summary: 's',
        facts: ['f1'],
        entities: [{ name: 'Kubernetes', type: 'Platform' }],
      },
    });
    const benchmark = generateBenchmark([node], 'domain');
    expect(benchmark.items[0].domain).toBe('platform');
  });

  it('uses general domain when no entities', () => {
    const node = makeNode({
      content: { summary: 's', facts: ['f1'], entities: [] },
    });
    const benchmark = generateBenchmark([node], 'domain');
    expect(benchmark.items[0].domain).toBe('general');
  });

  it('builds expectedAnswer from summary + facts', () => {
    const node = makeNode({
      content: { summary: 'Summary here', facts: ['fact A', 'fact B'] },
    });
    const benchmark = generateBenchmark([node], 'answer');
    expect(benchmark.items[0].expectedAnswer).toBe(
      'Summary here fact A fact B',
    );
  });

  it('returns empty items for empty input', () => {
    const benchmark = generateBenchmark([], 'empty');
    expect(benchmark.items).toHaveLength(0);
  });
});
