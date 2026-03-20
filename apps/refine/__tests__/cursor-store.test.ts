/**
 * Tests for the cursor persistence layer (cursor-store.ts).
 * Uses a temp directory to avoid polluting the project.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadCursor,
  loadCursors,
  saveCursor,
  removeCursor,
} from '../src/connectors/cursor-store.js';
import type { SyncCursor } from '../src/connectors/types.js';

describe('cursor-store', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ody-cursor-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loadCursors returns empty map when no file exists', () => {
    const map = loadCursors(tempDir);
    expect(map).toEqual({});
  });

  it('loadCursor returns undefined when no cursor exists', () => {
    const cursor = loadCursor('notion', tempDir);
    expect(cursor).toBeUndefined();
  });

  it('saveCursor persists a cursor and loadCursor retrieves it', () => {
    const cursor: SyncCursor = {
      type: 'timestamp',
      value: '2026-03-20T10:00:00.000Z',
      connectorName: 'notion',
    };

    saveCursor(cursor, tempDir);
    const loaded = loadCursor('notion', tempDir);

    expect(loaded).toBeDefined();
    expect(loaded!.type).toBe('timestamp');
    expect(loaded!.value).toBe('2026-03-20T10:00:00.000Z');
    expect(loaded!.connectorName).toBe('notion');
    expect(loaded!.updatedAt).toBeDefined();
  });

  it('saveCursor sets updatedAt automatically', () => {
    const before = new Date().toISOString();
    saveCursor({
      type: 'timestamp',
      value: '2026-01-01T00:00:00Z',
      connectorName: 'slack',
    }, tempDir);
    const after = new Date().toISOString();

    const loaded = loadCursor('slack', tempDir);
    expect(loaded!.updatedAt! >= before).toBe(true);
    expect(loaded!.updatedAt! <= after).toBe(true);
  });

  it('saveCursor merges with existing cursors', () => {
    saveCursor({
      type: 'timestamp',
      value: '2026-01-01T00:00:00Z',
      connectorName: 'notion',
    }, tempDir);

    saveCursor({
      type: 'change-token',
      value: '12345',
      connectorName: 'gmail',
    }, tempDir);

    const map = loadCursors(tempDir);
    expect(Object.keys(map)).toHaveLength(2);
    expect(map['notion']!.type).toBe('timestamp');
    expect(map['gmail']!.type).toBe('change-token');
  });

  it('saveCursor overwrites an existing cursor for same connector', () => {
    saveCursor({
      type: 'timestamp',
      value: '2026-01-01T00:00:00Z',
      connectorName: 'notion',
    }, tempDir);

    saveCursor({
      type: 'timestamp',
      value: '2026-03-20T12:00:00Z',
      connectorName: 'notion',
    }, tempDir);

    const loaded = loadCursor('notion', tempDir);
    expect(loaded!.value).toBe('2026-03-20T12:00:00Z');
  });

  it('removeCursor deletes a specific cursor', () => {
    saveCursor({
      type: 'timestamp',
      value: '2026-01-01T00:00:00Z',
      connectorName: 'notion',
    }, tempDir);
    saveCursor({
      type: 'timestamp',
      value: '123.456',
      connectorName: 'slack',
    }, tempDir);

    removeCursor('notion', tempDir);

    expect(loadCursor('notion', tempDir)).toBeUndefined();
    expect(loadCursor('slack', tempDir)).toBeDefined();
  });

  it('removeCursor is a no-op for nonexistent cursors', () => {
    removeCursor('nonexistent', tempDir);
    expect(loadCursors(tempDir)).toEqual({});
  });
});
