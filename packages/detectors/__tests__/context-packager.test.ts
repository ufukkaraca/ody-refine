import { describe, it, expect } from 'vitest';
import type { KnowledgeNode, KnowledgeEdge } from '@useody/platform-core';
import {
  extractEntityNames,
  groupByEntity,
  buildSourceMeta,
  buildContextPackages,
} from '../src/context-packager.js';

function makeNode(
  id: string,
  title: string,
  entities: Array<{ name: string; type: string }> = [],
  opts: Partial<KnowledgeNode> = {},
): KnowledgeNode {
  return {
    id,
    title,
    content: {
      summary: `Summary of ${title}`,
      facts: [`fact about ${title}`],
      entities,
      source: { sourceType: 'notion', sourceId: `src-${id}` },
    },
    embedding: [0.1],
    embeddingModel: 'test',
    embeddingDim: 1,
    confidence: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...opts,
  };
}

describe('context-packager', () => {
  describe('extractEntityNames', () => {
    it('extracts valid entity names as lowercase', () => {
      const node = makeNode('a', 'Test', [
        { name: 'React', type: 'tech' },
        { name: 'TypeScript', type: 'tech' },
      ]);
      const names = extractEntityNames(node);
      expect(names).toEqual(new Set(['react', 'typescript']));
    });

    it('skips malformed entities', () => {
      const node = makeNode('a', 'Test');
      // Inject malformed entities
      node.content.entities = [
        { name: '', type: 'x' },
        null as unknown as { name: string; type: string },
        { name: 'Valid', type: 'y' },
        undefined as unknown as { name: string; type: string },
      ];
      const names = extractEntityNames(node);
      expect(names).toEqual(new Set(['valid']));
    });

    it('returns empty set when entities is not an array', () => {
      const node = makeNode('a', 'Test');
      node.content.entities = undefined;
      expect(extractEntityNames(node).size).toBe(0);
    });
  });

  describe('groupByEntity', () => {
    it('groups nodes sharing entities', () => {
      const nodes = [
        makeNode('a', 'A', [{ name: 'React', type: 'tech' }]),
        makeNode('b', 'B', [{ name: 'React', type: 'tech' }, { name: 'Vue', type: 'tech' }]),
        makeNode('c', 'C', [{ name: 'Python', type: 'tech' }]),
      ];
      const groups = groupByEntity(nodes);
      // a and b share 'react', c is alone
      expect(groups.size).toBe(1);
      const cluster = [...groups.values()][0]!;
      const ids = cluster.map((n) => n.id).sort();
      expect(ids).toEqual(['a', 'b']);
    });

    it('skips singletons', () => {
      const nodes = [
        makeNode('a', 'A', [{ name: 'React', type: 'tech' }]),
        makeNode('b', 'B', [{ name: 'Vue', type: 'tech' }]),
      ];
      const groups = groupByEntity(nodes);
      expect(groups.size).toBe(0);
    });
  });

  describe('buildSourceMeta', () => {
    it('extracts source metadata', () => {
      const node = makeNode('a', 'Test', [], {
        metadata: { author: 'ufuk', authorRole: 'executive' },
      });
      node.content.source = {
        sourceType: 'notion',
        sourceId: 'src-a',
        lastModified: new Date('2026-01-01'),
      };
      const meta = buildSourceMeta(node);
      expect(meta.sourceType).toBe('notion');
      expect(meta.author).toBe('ufuk');
      expect(meta.authorRole).toBe('executive');
      expect(meta.lastModified).toEqual(new Date('2026-01-01'));
    });

    it('handles missing metadata gracefully', () => {
      const node = makeNode('a', 'Test');
      node.content.source = undefined;
      node.metadata = undefined;
      const meta = buildSourceMeta(node);
      expect(meta.sourceType).toBe('unknown');
      expect(meta.author).toBeUndefined();
    });
  });

  describe('buildContextPackages', () => {
    it('produces packages from nodes with shared entities', () => {
      const nodes = [
        makeNode('a', 'Pricing A', [{ name: 'API', type: 'product' }, { name: 'billing', type: 'concept' }]),
        makeNode('b', 'Pricing B', [{ name: 'API', type: 'product' }, { name: 'billing', type: 'concept' }]),
        makeNode('c', 'Infra', [{ name: 'k8s', type: 'tech' }]),
      ];
      const edges: KnowledgeEdge[] = [{
        id: 'e1', sourceId: 'a', targetId: 'b',
        type: 'related', reason: 'same topic', confidence: 0.9,
      }];
      const pkgs = buildContextPackages(nodes, edges);
      expect(pkgs.length).toBe(1);
      expect(pkgs[0]!.nodes.length).toBe(2);
      expect(pkgs[0]!.edges.length).toBe(1);
      expect(pkgs[0]!.sharedEntities).toContain('api');
      expect(pkgs[0]!.sourceMetadata.length).toBe(2);
    });

    it('returns empty array when no shared entities', () => {
      const nodes = [
        makeNode('a', 'A', [{ name: 'X', type: 't' }]),
        makeNode('b', 'B', [{ name: 'Y', type: 't' }]),
      ];
      const pkgs = buildContextPackages(nodes, []);
      expect(pkgs.length).toBe(0);
    });

    it('skips packages with fewer than 2 nodes', () => {
      const nodes = [makeNode('a', 'A', [{ name: 'Solo', type: 't' }])];
      const pkgs = buildContextPackages(nodes, []);
      expect(pkgs.length).toBe(0);
    });
  });
});
