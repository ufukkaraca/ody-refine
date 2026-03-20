/**
 * Cursor persistence for incremental sync.
 * Stores sync cursors to disk so connectors can resume from where they left off.
 * Storage location: .ody-refine/cursors.json in the current working directory.
 * @module connectors/cursor-store
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SyncCursor } from './types.js';

/** Default directory for Ody Refine state files. */
const STATE_DIR = '.ody-refine';
/** Filename for the cursor store. */
const CURSORS_FILE = 'cursors.json';

/** In-memory representation of the cursor store. */
type CursorMap = Record<string, SyncCursor>;

/** Resolve the path to the cursors file, optionally from a custom base. */
function cursorsPath(baseDir?: string): string {
  const base = baseDir ?? process.cwd();
  return join(base, STATE_DIR, CURSORS_FILE);
}

/** Load all cursors from disk. Returns an empty map if file does not exist. */
export function loadCursors(baseDir?: string): CursorMap {
  try {
    const raw = readFileSync(cursorsPath(baseDir), 'utf-8');
    return JSON.parse(raw) as CursorMap;
  } catch {
    return {};
  }
}

/** Load a single cursor by connector name. Returns undefined if not found. */
export function loadCursor(
  connectorName: string,
  baseDir?: string,
): SyncCursor | undefined {
  const map = loadCursors(baseDir);
  return map[connectorName];
}

/** Save a cursor to disk. Merges with existing cursors. */
export function saveCursor(
  cursor: SyncCursor,
  baseDir?: string,
): void {
  const base = baseDir ?? process.cwd();
  const dir = join(base, STATE_DIR);
  mkdirSync(dir, { recursive: true });

  const map = loadCursors(baseDir);
  map[cursor.connectorName] = {
    ...cursor,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(cursorsPath(baseDir), JSON.stringify(map, null, 2), 'utf-8');
}

/** Remove a cursor from disk. */
export function removeCursor(
  connectorName: string,
  baseDir?: string,
): void {
  const map = loadCursors(baseDir);
  delete map[connectorName];

  const base = baseDir ?? process.cwd();
  const dir = join(base, STATE_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(cursorsPath(baseDir), JSON.stringify(map, null, 2), 'utf-8');
}
