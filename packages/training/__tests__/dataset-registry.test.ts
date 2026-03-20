import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatasetRegistry } from '../src/dataset-registry.js';
import { createTrainingSchema } from '../src/schema.js';
import type { DatasetVersion } from '../src/types.js';

function makeVersion(overrides: Partial<DatasetVersion> = {}): DatasetVersion {
  return {
    id: crypto.randomUUID(),
    version: '1.0.0',
    dataPath: '/tmp/test-dataset.jsonl',
    nodeCount: 100,
    preferencePairCount: 50,
    sftEntryCount: 0,
    evalItemCount: 25,
    lineage: { sourceType: 'refine_export' },
    createdAt: new Date(),
    ...overrides,
  };
}

describe('DatasetRegistry', () => {
  let db: Database.Database;
  let registry: DatasetRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    createTrainingSchema(db);
    registry = new DatasetRegistry(db);
  });

  describe('create + findById', () => {
    it('should insert and retrieve a dataset version', () => {
      const v = makeVersion();
      registry.create(v);
      const found = registry.findById(v.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(v.id);
      expect(found!.version).toBe('1.0.0');
      expect(found!.nodeCount).toBe(100);
      expect(found!.lineage.sourceType).toBe('refine_export');
    });

    it('should return null for missing ID', () => {
      expect(registry.findById('nonexistent')).toBeNull();
    });

    it('should store optional fields', () => {
      const v = makeVersion({
        sourceAuditId: 'audit-1',
        lineage: {
          sourceType: 'incremental',
          parentVersionId: 'parent-1',
          refinedAt: new Date('2025-01-01'),
          nodeFilter: { minConfidence: 0.8 },
        },
      });
      registry.create(v);
      const found = registry.findById(v.id)!;
      expect(found.sourceAuditId).toBe('audit-1');
      expect(found.lineage.parentVersionId).toBe('parent-1');
      expect(found.lineage.refinedAt).toEqual(new Date('2025-01-01'));
      expect(found.lineage.nodeFilter).toEqual({ minConfidence: 0.8 });
    });
  });

  describe('list', () => {
    it('should return versions sorted by createdAt desc', () => {
      const v1 = makeVersion({
        version: '1.0.0',
        createdAt: new Date('2025-01-01'),
      });
      const v2 = makeVersion({
        version: '2.0.0',
        createdAt: new Date('2025-06-01'),
      });
      registry.create(v1);
      registry.create(v2);
      const all = registry.list();
      expect(all).toHaveLength(2);
      expect(all[0]!.version).toBe('2.0.0');
      expect(all[1]!.version).toBe('1.0.0');
    });

    it('should return empty array when no versions exist', () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe('diff', () => {
    it('should return the delta between two versions', () => {
      const v1 = makeVersion({
        version: '1.0.0',
        nodeCount: 100,
        preferencePairCount: 50,
        evalItemCount: 25,
      });
      const v2 = makeVersion({
        version: '2.0.0',
        nodeCount: 150,
        preferencePairCount: 80,
        evalItemCount: 30,
      });
      registry.create(v1);
      registry.create(v2);
      const delta = registry.diff(v1.id, v2.id);
      expect(delta.fromVersion).toBe('1.0.0');
      expect(delta.toVersion).toBe('2.0.0');
      expect(delta.nodeCountDelta).toBe(50);
      expect(delta.preferencePairDelta).toBe(30);
      expect(delta.evalItemDelta).toBe(5);
    });

    it('should throw for missing version', () => {
      const v = makeVersion();
      registry.create(v);
      expect(() => registry.diff(v.id, 'missing')).toThrow(
        'Dataset version not found: missing',
      );
    });
  });

  describe('getLineage', () => {
    it('should walk the parent chain', () => {
      const v1 = makeVersion({ version: '1.0.0' });
      const v2 = makeVersion({
        version: '2.0.0',
        lineage: {
          sourceType: 'incremental',
          parentVersionId: v1.id,
        },
      });
      const v3 = makeVersion({
        version: '3.0.0',
        lineage: {
          sourceType: 'incremental',
          parentVersionId: v2.id,
        },
      });
      registry.create(v1);
      registry.create(v2);
      registry.create(v3);

      const chain = registry.getLineage(v3.id);
      expect(chain).toHaveLength(3);
      expect(chain[0]!.version).toBe('3.0.0');
      expect(chain[1]!.version).toBe('2.0.0');
      expect(chain[2]!.version).toBe('1.0.0');
    });

    it('should return single item for version with no parent', () => {
      const v = makeVersion();
      registry.create(v);
      const chain = registry.getLineage(v.id);
      expect(chain).toHaveLength(1);
      expect(chain[0]!.id).toBe(v.id);
    });

    it('should return empty array for missing ID', () => {
      expect(registry.getLineage('nonexistent')).toEqual([]);
    });
  });
});
