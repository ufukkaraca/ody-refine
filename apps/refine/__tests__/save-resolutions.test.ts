/**
 * Tests for resolution persistence.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveResolutions, countResolutions } from '../src/resolve/save-resolutions.js';

const TMP = join(tmpdir(), 'ody-res-test-' + Date.now().toString(36));

let db: unknown;

describe('saveResolutions', () => {
  beforeAll(async () => {
    mkdirSync(TMP, { recursive: true });
    const core = await import('@useody/platform-core');
    db = core.openDatabase(join(TMP, 'test.db'));
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('starts with zero resolutions', () => {
    expect(countResolutions(db)).toBe(0);
  });

  it('saves resolutions and increments count', () => {
    saveResolutions(db, [
      { detectionType: 'contradiction', nodeIds: ['a', 'b'], action: 'dismissed' },
      { detectionType: 'staleness', nodeIds: ['c'], action: 'resolved', reason: 'fixed it' },
    ]);
    expect(countResolutions(db)).toBe(2);
  });

  it('accumulates across multiple saves', () => {
    saveResolutions(db, [
      { detectionType: 'time_bomb', nodeIds: ['d'], action: 'keep' },
    ]);
    expect(countResolutions(db)).toBe(3);
  });
});
