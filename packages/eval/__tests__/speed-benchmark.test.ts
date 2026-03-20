import { describe, it, expect } from 'vitest';
import { timeDetector, runSpeedBenchmark } from '../src/speed-benchmark.js';
import type {
  KnowledgeNode,
  KnowledgeEdge,
  Detection,
  DetectorFn,
} from '@useody/platform-core';

function makeNode(id: string): KnowledgeNode {
  return {
    id, title: `Node ${id}`,
    content: { summary: 'test', facts: ['fact'], raw: `Raw content for ${id}` },
    embedding: [], embeddingModel: 'test', embeddingDim: 0,
    confidence: 0.9, createdAt: new Date(), updatedAt: new Date(),
  };
}

function makeFastDetector(): DetectorFn {
  const fn: DetectorFn = async (
    nodes: KnowledgeNode[],
    _edges: KnowledgeEdge[],
  ): Promise<Detection[]> => {
    if (nodes.length >= 2) {
      return [{
        type: 'contradiction', severity: 'warning',
        nodeIds: [nodes[0]!.id, nodes[1]!.id],
        description: 'found something',
      }];
    }
    return [];
  };
  fn.preFilter = { similarityThreshold: 0.6, topK: 10 };
  return fn;
}

describe('timeDetector', () => {
  it('measures execution time', async () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const detector = makeFastDetector();

    const result = await timeDetector('test-detector', detector, nodes, []);

    expect(result.detectorName).toBe('test-detector');
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.nodeCount).toBe(2);
    expect(result.findingCount).toBe(1);
    expect(result.perNodeMs).toBeGreaterThanOrEqual(0);
  });

  it('handles empty corpus', async () => {
    const detector = makeFastDetector();
    const result = await timeDetector('empty', detector, [], []);

    expect(result.nodeCount).toBe(0);
    expect(result.findingCount).toBe(0);
    expect(result.perNodeMs).toBe(0);
  });
});

describe('runSpeedBenchmark', () => {
  it('runs all detectors and reports total time', async () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const detectors = new Map<string, DetectorFn>([
      ['fast-1', makeFastDetector()],
      ['fast-2', makeFastDetector()],
    ]);

    const result = await runSpeedBenchmark(detectors, nodes, [], 30_000);

    expect(result.timings).toHaveLength(2);
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.meetsTarget).toBe(true);
  });

  it('fails when exceeding target', async () => {
    const detector: DetectorFn = async (): Promise<Detection[]> => {
      // Simulate slow detector
      await new Promise((resolve) => setTimeout(resolve, 50));
      return [];
    };
    detector.preFilter = { similarityThreshold: 0, topK: 0 };

    const detectors = new Map<string, DetectorFn>([['slow', detector]]);
    const result = await runSpeedBenchmark(detectors, [], [], 1); // 1ms target

    expect(result.meetsTarget).toBe(false);
  });
});
