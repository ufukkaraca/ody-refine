import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { PreferencePairStore } from '../src/pair-store.js';
import type { PreferencePair } from '@useody/platform-core';

function makePair(overrides?: Partial<PreferencePair>): PreferencePair {
  return {
    prompt: 'What is the deploy cadence?',
    chosen: 'We deploy weekly on Tuesdays.',
    rejected: 'We deploy daily.',
    metadata: {
      conflictType: 'contradiction',
      resolvedBy: 'cli-user',
      resolvedAt: new Date('2026-03-16T10:00:00Z'),
      confidence: 1.0,
      sourceNodeIds: ['node-a', 'node-b'],
    },
    ...overrides,
  };
}

describe('PreferencePairStore', () => {
  let db: Database.Database;
  let store: PreferencePairStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new PreferencePairStore(db);
  });

  describe('save', () => {
    it('should persist a single preference pair', () => {
      store.save(makePair());
      expect(store.count()).toBe(1);
    });

    it('should store all fields correctly', () => {
      store.save(makePair());
      const pairs = store.findUnexported();
      expect(pairs).toHaveLength(1);
      const pair = pairs[0]!;
      expect(pair.prompt).toBe('What is the deploy cadence?');
      expect(pair.chosen).toBe('We deploy weekly on Tuesdays.');
      expect(pair.rejected).toBe('We deploy daily.');
      expect(pair.metadata.conflictType).toBe('contradiction');
      expect(pair.metadata.resolvedBy).toBe('cli-user');
      expect(pair.metadata.confidence).toBe(1.0);
      expect(pair.metadata.sourceNodeIds).toEqual(['node-a', 'node-b']);
    });
  });

  describe('saveBatch', () => {
    it('should persist multiple pairs in a transaction', () => {
      const pairs = [
        makePair({ prompt: 'Q1' }),
        makePair({ prompt: 'Q2' }),
        makePair({ prompt: 'Q3' }),
      ];
      store.saveBatch(pairs);
      expect(store.count()).toBe(3);
    });

    it('should handle empty batch gracefully', () => {
      store.saveBatch([]);
      expect(store.count()).toBe(0);
    });
  });

  describe('findUnexported', () => {
    it('should return only unexported pairs', () => {
      store.save(makePair({ prompt: 'Q1' }));
      store.save(makePair({ prompt: 'Q2' }));
      expect(store.findUnexported()).toHaveLength(2);
    });

    it('should not return exported pairs', () => {
      store.save(makePair({ prompt: 'Q1' }));

      // Manually mark as exported
      db.prepare(
        'UPDATE preference_pairs SET exported = 1',
      ).run();

      expect(store.findUnexported()).toHaveLength(0);
    });
  });

  describe('count / countUnexported', () => {
    it('should count total and unexported pairs', () => {
      store.saveBatch([
        makePair({ prompt: 'Q1' }),
        makePair({ prompt: 'Q2' }),
        makePair({ prompt: 'Q3' }),
      ]);

      expect(store.count()).toBe(3);
      expect(store.countUnexported()).toBe(3);

      // Mark one as exported
      const row = db.prepare(
        'SELECT id FROM preference_pairs LIMIT 1',
      ).get() as { id: string };
      store.markExported([row.id]);

      expect(store.count()).toBe(3);
      expect(store.countUnexported()).toBe(2);
    });
  });

  describe('markExported', () => {
    it('should mark specific pairs as exported', () => {
      store.saveBatch([
        makePair({ prompt: 'Q1' }),
        makePair({ prompt: 'Q2' }),
      ]);

      const rows = db.prepare(
        'SELECT id FROM preference_pairs',
      ).all() as Array<{ id: string }>;
      store.markExported([rows[0]!.id]);

      expect(store.countUnexported()).toBe(1);
    });

    it('should handle empty id list gracefully', () => {
      store.markExported([]);
      expect(store.count()).toBe(0);
    });
  });

  describe('exportDpo', () => {
    const tmpFile = join(tmpdir(), `ody-test-dpo-${Date.now()}.jsonl`);

    afterEach(() => {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    });

    it('should write JSONL with prompt/chosen/rejected fields', () => {
      store.saveBatch([
        makePair({ prompt: 'Q1', chosen: 'A1', rejected: 'R1' }),
        makePair({ prompt: 'Q2', chosen: 'A2', rejected: 'R2' }),
      ]);

      const exported = store.exportDpo(tmpFile);
      expect(exported).toBe(2);

      const content = readFileSync(tmpFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);

      const first = JSON.parse(lines[0]!) as Record<string, unknown>;
      expect(first).toHaveProperty('prompt', 'Q1');
      expect(first).toHaveProperty('chosen', 'A1');
      expect(first).toHaveProperty('rejected', 'R1');
      // Should NOT include metadata in DPO output
      expect(first).not.toHaveProperty('metadata');
    });

    it('should mark pairs as exported after writing', () => {
      store.save(makePair());
      expect(store.countUnexported()).toBe(1);

      store.exportDpo(tmpFile);
      expect(store.countUnexported()).toBe(0);
    });

    it('should return 0 when no unexported pairs exist', () => {
      const exported = store.exportDpo(tmpFile);
      expect(exported).toBe(0);
      expect(existsSync(tmpFile)).toBe(false);
    });

    it('should not re-export already exported pairs', () => {
      store.save(makePair({ prompt: 'Q1' }));
      store.exportDpo(tmpFile);
      if (existsSync(tmpFile)) unlinkSync(tmpFile);

      store.save(makePair({ prompt: 'Q2' }));
      const exported = store.exportDpo(tmpFile);
      expect(exported).toBe(1);

      const content = readFileSync(tmpFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
      expect(parsed).toHaveProperty('prompt', 'Q2');
    });
  });
});
