import { describe, it, expect } from 'vitest';
import {
  measureConsistency,
  jaccard,
  detectionKey,
} from '../src/consistency-measure.js';
import type {
  KnowledgeNode,
  KnowledgeEdge,
  Detection,
  DetectorFn,
} from '@useody/platform-core';

function makeNode(id: string, title: string): KnowledgeNode {
  return {
    id, title,
    content: { summary: 'test', facts: ['fact1'], raw: title },
    embedding: [], embeddingModel: 'test', embeddingDim: 0,
    confidence: 0.9, createdAt: new Date(), updatedAt: new Date(),
  };
}

describe('jaccard', () => {
  it('returns 1 for identical sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });

  it('returns correct value for overlapping sets', () => {
    expect(jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBeCloseTo(0.5);
  });

  it('returns 1 for two empty sets', () => {
    expect(jaccard(new Set(), new Set())).toBe(1);
  });
});

describe('detectionKey', () => {
  it('produces canonical key with sorted nodeIds', () => {
    const det: Detection = {
      type: 'contradiction',
      severity: 'warning',
      nodeIds: ['z-node', 'a-node'],
      description: 'test',
    };
    expect(detectionKey(det)).toBe('contradiction:a-node,z-node');
  });

  it('handles single nodeId', () => {
    const det: Detection = {
      type: 'staleness',
      severity: 'info',
      nodeIds: ['node-1'],
      description: 'test',
    };
    expect(detectionKey(det)).toBe('staleness:node-1');
  });
});

describe('measureConsistency', () => {
  it('returns perfect consistency for deterministic detector', async () => {
    const detector: DetectorFn = async (
      nodes: KnowledgeNode[],
      _edges: KnowledgeEdge[],
    ): Promise<Detection[]> => {
      if (nodes.length >= 2) {
        return [{
          type: 'contradiction', severity: 'warning',
          nodeIds: [nodes[0]!.id, nodes[1]!.id],
          description: 'deterministic finding',
        }];
      }
      return [];
    };
    detector.preFilter = { similarityThreshold: 0.6, topK: 10 };

    const nodes = [makeNode('a', 'A'), makeNode('b', 'B')];
    const result = await measureConsistency(detector, nodes, [], 3, 0.8);

    expect(result.meanSimilarity).toBe(1);
    expect(result.minSimilarity).toBe(1);
    expect(result.passesThreshold).toBe(true);
    expect(result.findingsPerRun).toEqual([1, 1, 1]);
  });

  it('returns low similarity for non-deterministic detector', async () => {
    let callCount = 0;
    const detector: DetectorFn = async (
      nodes: KnowledgeNode[],
      _edges: KnowledgeEdge[],
    ): Promise<Detection[]> => {
      callCount++;
      // Alternate between finding something and finding nothing
      if (callCount % 2 === 0) return [];
      return [{
        type: 'contradiction', severity: 'warning',
        nodeIds: [nodes[0]!.id, nodes[1]!.id],
        description: 'intermittent',
      }];
    };
    detector.preFilter = { similarityThreshold: 0.6, topK: 10 };

    const nodes = [makeNode('a', 'A'), makeNode('b', 'B')];
    const result = await measureConsistency(detector, nodes, [], 4, 0.8);

    expect(result.minSimilarity).toBeLessThan(1);
    // Some runs find 0, some find 1, so not perfectly consistent
  });

  it('handles detector that returns empty', async () => {
    const detector: DetectorFn = async (): Promise<Detection[]> => [];
    detector.preFilter = { similarityThreshold: 0, topK: 0 };

    const result = await measureConsistency(detector, [], [], 3, 0.8);

    expect(result.meanSimilarity).toBe(1);
    expect(result.passesThreshold).toBe(true);
    expect(result.uniqueFindings).toBe(0);
  });
});
