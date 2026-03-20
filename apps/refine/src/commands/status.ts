/**
 * Status command — shows database stats.
 * @module commands/status
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { printStatus } from '../output/index.js';
import { loadDetections } from '../detect/detection-store.js';
import { countResolutions } from '../resolve/save-resolutions.js';

/** Safely count rows in a table that may not exist. */
function safeCount(
  db: { prepare(sql: string): { get(...p: unknown[]): unknown } },
  table: string,
  where?: string,
): number {
  try {
    const clause = where ? ` WHERE ${where}` : '';
    const row = db.prepare(
      `SELECT COUNT(*) as cnt FROM ${table}${clause}`,
    ).get() as { cnt: number };
    return row.cnt;
  } catch {
    return 0;
  }
}

/** Create the status command. */
export function createStatusCommand(): Command {
  return new Command('status')
    .description('Show knowledge graph database status')
    .option('--config <path>', 'Path to config file')
    .addHelpText('after', `
Examples:
  $ ody-refine status                  Show node/edge counts and DB path
`)
    .action(async (opts: { config?: string }) => {
      const config = loadConfig(opts.config);
      const dbPath = resolve(config.dataDir, 'refine.db');

      if (!existsSync(dbPath)) {
        process.stdout.write(
          'No database found. Run `ody-refine ingest <directory>` first.\n',
        );
        return;
      }

      try {
        const core = await import('@useody/platform-core');
        const db = core.openDatabase(dbPath);
        const dim = 768;
        core.createSchema(db, dim);

        const nodeRepo = new core.SQLiteNodeRepository(db);
        const edgeRepo = new core.SQLiteEdgeRepository(db);
        const nodeCount = await nodeRepo.count();
        const allEdges = await edgeRepo.findAll();

        const cached = loadDetections(db as never);
        const detectionCount = cached?.length ?? 0;
        const resolutionCount = countResolutions(db);
        const pairTotal = safeCount(db, 'preference_pairs');
        const pairUnexported = safeCount(
          db, 'preference_pairs', 'exported = 0',
        );

        printStatus(
          {
            nodes: nodeCount,
            edges: allEdges.length,
            resolutions: resolutionCount,
            detections: detectionCount,
            pairs: pairTotal,
            pairsUnexported: pairUnexported,
          },
          dbPath,
        );
        db.close();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Status check failed: ${msg}\n`);
        process.exitCode = 1;
      }
    });
}
