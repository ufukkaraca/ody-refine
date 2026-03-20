import { describe, it, expect, beforeAll } from 'vitest';
import type { Detection } from '@useody/platform-core';
import { saveDetections, loadDetections, saveHealthScore, loadHealthScore } from '../src/detect/detection-store.js';

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    type: 'contradiction',
    severity: 'critical',
    nodeIds: ['node-1', 'node-2'],
    description: 'Rate limit: 1000 vs 500',
    suggestedAction: 'Align documentation',
    metadata: { topic: 'Rate limits', confidence: 'high' },
    ...overrides,
  };
}

/** Use platform-core's openDatabase for a proper SQLite handle. */
let openDb: (path: string) => unknown;

beforeAll(async () => {
  const core = await import('@useody/platform-core');
  openDb = core.openDatabase;
});

describe('detection-store', () => {
  function createDb(): unknown {
    return openDb(':memory:');
  }

  describe('saveDetections', () => {
    it('saves detections to the database', () => {
      const db = createDb();
      const detections = [makeDetection(), makeDetection({ type: 'staleness' })];
      saveDetections(db as Parameters<typeof saveDetections>[0], detections);

      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);
      expect(loaded).toHaveLength(2);
    });

    it('clears previous detections before saving', () => {
      const db = createDb();
      saveDetections(db as Parameters<typeof saveDetections>[0], [makeDetection()]);
      saveDetections(db as Parameters<typeof saveDetections>[0], [makeDetection(), makeDetection()]);

      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);
      expect(loaded).toHaveLength(2);
    });

    it('handles detections without optional fields', () => {
      const db = createDb();
      const minimal: Detection = {
        type: 'duplicate',
        severity: 'info',
        nodeIds: ['n1'],
        description: 'Duplicate content',
      };
      saveDetections(db as Parameters<typeof saveDetections>[0], [minimal]);

      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);
      expect(loaded).toHaveLength(1);
    });

    it('saves empty array without error', () => {
      const db = createDb();
      saveDetections(db as Parameters<typeof saveDetections>[0], []);
      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);
      expect(loaded).toBeNull();
    });
  });

  describe('loadDetections', () => {
    it('loads previously saved detections with all fields', () => {
      const db = createDb();
      const original = [
        makeDetection(),
        makeDetection({
          type: 'staleness',
          severity: 'warning',
          nodeIds: ['n3'],
          description: 'Stale doc',
          suggestedAction: 'Update',
          metadata: { age: 365 },
        }),
      ];
      saveDetections(db as Parameters<typeof saveDetections>[0], original);

      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);
      expect(loaded).not.toBeNull();
      expect(loaded).toHaveLength(2);

      expect(loaded![0]!.type).toBe('contradiction');
      expect(loaded![0]!.severity).toBe('critical');
      expect(loaded![0]!.nodeIds).toEqual(['node-1', 'node-2']);
      expect(loaded![0]!.description).toBe('Rate limit: 1000 vs 500');
      expect(loaded![0]!.suggestedAction).toBe('Align documentation');
      expect(loaded![0]!.metadata).toEqual({ topic: 'Rate limits', confidence: 'high' });

      expect(loaded![1]!.type).toBe('staleness');
      expect(loaded![1]!.metadata).toEqual({ age: 365 });
    });

    it('returns null when no cache table exists', () => {
      const db = createDb();
      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);
      expect(loaded).toBeNull();
    });

    it('returns null when table exists but is empty', () => {
      const db = createDb();
      saveDetections(db as Parameters<typeof saveDetections>[0], []);
      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);
      expect(loaded).toBeNull();
    });

    it('handles detections without suggestedAction', () => {
      const db = createDb();
      saveDetections(
        db as Parameters<typeof saveDetections>[0],
        [makeDetection({ suggestedAction: undefined })],
      );
      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);

      expect(loaded).not.toBeNull();
      expect(loaded![0]!.suggestedAction).toBeUndefined();
    });

    it('handles detections without metadata', () => {
      const db = createDb();
      saveDetections(
        db as Parameters<typeof saveDetections>[0],
        [makeDetection({ metadata: undefined })],
      );
      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);

      expect(loaded).not.toBeNull();
      expect(loaded![0]!.metadata).toBeUndefined();
    });

    it('round-trips all detection types', () => {
      const db = createDb();
      const types: Detection['type'][] = [
        'contradiction', 'duplicate', 'staleness', 'undocumented', 'time_bomb',
      ];
      const detections = types.map((type) => makeDetection({ type }));
      saveDetections(db as Parameters<typeof saveDetections>[0], detections);

      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);
      expect(loaded).toHaveLength(5);
      expect(loaded!.map((d) => d.type)).toEqual(types);
    });

    it('preserves order of detections', () => {
      const db = createDb();
      const detections = [
        makeDetection({ description: 'First' }),
        makeDetection({ description: 'Second' }),
        makeDetection({ description: 'Third' }),
      ];
      saveDetections(db as Parameters<typeof saveDetections>[0], detections);

      const loaded = loadDetections(db as Parameters<typeof loadDetections>[0]);
      expect(loaded![0]!.description).toBe('First');
      expect(loaded![1]!.description).toBe('Second');
      expect(loaded![2]!.description).toBe('Third');
    });
  });

  describe('saveHealthScore / loadHealthScore', () => {
    it('saves and loads a health score', () => {
      const db = createDb();
      saveHealthScore(db as Parameters<typeof saveHealthScore>[0], 74);
      const score = loadHealthScore(db as Parameters<typeof loadHealthScore>[0]);
      expect(score).toBe(74);
    });

    it('overwrites previous score', () => {
      const db = createDb();
      const typedDb = db as Parameters<typeof saveHealthScore>[0];
      saveHealthScore(typedDb, 60);
      saveHealthScore(typedDb, 85);
      expect(loadHealthScore(typedDb)).toBe(85);
    });

    it('returns null when no score cached', () => {
      const db = createDb();
      expect(loadHealthScore(db as Parameters<typeof loadHealthScore>[0])).toBeNull();
    });
  });
});
