/**
 * Diff command — show changes since a previous scan.
 * @module commands/diff
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { createSpinner } from '../output/index.js';
import type { Detection } from '@useody/platform-core';

/** Compare two sets of detections by description hash. */
function diffDetections(
  current: Detection[],
  previous: Detection[],
): { added: Detection[]; removed: Detection[]; unchanged: Detection[] } {
  const prevKeys = new Set(previous.map((d) => `${d.type}:${d.nodeIds.sort().join(',')}`));
  const currKeys = new Set(current.map((d) => `${d.type}:${d.nodeIds.sort().join(',')}`));

  return {
    added: current.filter((d) => !prevKeys.has(`${d.type}:${d.nodeIds.sort().join(',')}`)),
    removed: previous.filter((d) => !currKeys.has(`${d.type}:${d.nodeIds.sort().join(',')}`)),
    unchanged: current.filter((d) => prevKeys.has(`${d.type}:${d.nodeIds.sort().join(',')}`)),
  };
}

/** Create the diff command. */
export function createDiffCommand(): Command {
  return new Command('diff')
    .description('Show changes since the last scan')
    .option('--config <path>', 'Path to config file')
    .option('--since <date>', 'Compare against scan from this date (ISO format)')
    .addHelpText('after', `
Examples:
  $ ody-refine diff                    Compare current vs last cached scan
  $ ody-refine diff --since 2026-03-01 Compare against a specific date
`)
    .action(async (opts: { config?: string; since?: string }) => {
      const spinner = createSpinner('Loading...');
      spinner.start();

      const config = loadConfig(opts.config);
      const dbPath = resolve(config.dataDir, 'refine.db');

      if (!existsSync(dbPath)) {
        spinner.fail(`No database found at ${dbPath}. Run 'ody-refine ingest' first.`);
        process.exitCode = 1;
        return;
      }

      try {
        const core = await import('@useody/platform-core');
        const detectorsMod = await import('@useody/detectors');
        const { loadDetections } = await import('../detect/detection-store.js');

        const db = core.openDatabase(dbPath);
        const row = db.prepare(
          'SELECT embedding_dim FROM knowledge_nodes LIMIT 1',
        ).get() as { embedding_dim: number } | undefined;
        const dim = row?.embedding_dim ?? 384;
        core.createSchema(db, dim);

        // Load cached previous detections
        const previous = loadDetections(db as never) ?? [];

        if (previous.length === 0) {
          spinner.fail('No previous scan results found. Run a full scan first.');
          process.exitCode = 1;
          return;
        }

        // Run current detection
        spinner.text = 'Running fresh detection...';
        const nodeRepo = new core.SQLiteNodeRepository(db);
        const edgeRepo = new core.SQLiteEdgeRepository(db);
        const vecIndex = new core.SqliteVecIndex(db, dim);

        const result = await core.runDetection({
          nodeRepo,
          edgeRepo,
          vecIndex,
          detectors: [
            detectorsMod.detectContradictions,
            detectorsMod.detectDuplicates,
            detectorsMod.detectStaleness,
            detectorsMod.detectUndocumented,
            detectorsMod.detectTimeBombs,
          ],
        });

        spinner.succeed('Diff complete');

        const { added, removed } = diffDetections(
          result.detections,
          previous,
        );

        const w = process.stdout.write.bind(process.stdout);
        w('\n');
        w(`  Previous: ${String(previous.length)} issue(s)\n`);
        w(`  Current:  ${String(result.detections.length)} issue(s)\n`);
        w('\n');

        if (added.length > 0) {
          w(`  + ${String(added.length)} new issue(s)\n`);
          for (const d of added.slice(0, 10)) {
            w(`    + [${d.type}] ${d.description.slice(0, 70)}\n`);
          }
        }

        if (removed.length > 0) {
          w(`  - ${String(removed.length)} resolved issue(s)\n`);
          for (const d of removed.slice(0, 10)) {
            w(`    - [${d.type}] ${d.description.slice(0, 70)}\n`);
          }
        }

        if (added.length === 0 && removed.length === 0) {
          w('  No changes since last scan.\n');
        }

        w('\n');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        spinner.fail(`Diff failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}

export { diffDetections };
