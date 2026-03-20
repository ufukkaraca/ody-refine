/**
 * Persist preference pairs to SQLite and optionally export to JSONL.
 * @module resolve/save-pairs
 */
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { PreferencePair } from '@useody/platform-core';
import type { InteractiveResolution } from './resolve-interactive.js';

/** Save resolutions to DB, persist pairs, and optionally export JSONL. */
export async function persistResolutions(
  db: unknown,
  resolutions: InteractiveResolution[],
  outputPath?: string,
): Promise<void> {
  const { saveResolutions } = await import('./save-resolutions.js');

  const records = resolutions
    .filter((r) => r.action !== 'skip')
    .map((r) => ({
      detectionType: r.detection.type,
      nodeIds: r.detection.nodeIds,
      action: r.action as 'keep' | 'dismissed' | 'resolved',
      reason: `User chose: ${r.action}`,
    }));

  if (records.length > 0) {
    saveResolutions(db, records);
  }

  const pairs = resolutions
    .map((r) => r.pair)
    .filter((p): p is PreferencePair => p != null);

  if (pairs.length > 0) {
    const { PreferencePairStore } = await import('@useody/feedback');
    const store = new PreferencePairStore(db);
    store.saveBatch(pairs);
    process.stdout.write(
      `  Saved ${String(pairs.length)} training pair(s) to database.\n`,
    );
  }

  if (outputPath && pairs.length > 0) {
    const { exportPreferencePairsToJsonl } = await import(
      '@useody/export'
    );
    const jsonl = exportPreferencePairsToJsonl(pairs);
    const outFile = resolve(outputPath);
    writeFileSync(outFile, jsonl + '\n', 'utf-8');
    process.stdout.write(
      `  Exported ${String(pairs.length)} pair(s) to ${outFile}\n`,
    );
  }

  printSummary(resolutions);
}

/** Print a summary of resolved, dismissed, skipped counts. */
function printSummary(resolutions: InteractiveResolution[]): void {
  const total = resolutions.length;
  const resolved = resolutions.filter((r) => r.pair).length;
  const dismissed = resolutions.filter(
    (r) => r.action === 'dismiss',
  ).length;
  const skipped = resolutions.filter(
    (r) => r.action === 'skip',
  ).length;

  process.stdout.write(
    `\n  Summary: ${String(total)} total, `
    + `${String(resolved)} resolved, `
    + `${String(dismissed)} dismissed, `
    + `${String(skipped)} skipped\n`,
  );
}
