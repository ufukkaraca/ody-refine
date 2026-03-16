/**
 * Status command — shows database stats.
 * @module commands/status
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { printStatus } from '../output/index.js';

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

        printStatus(
          { nodes: nodeCount, edges: allEdges.length, resolutions: 0 },
          dbPath,
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Status check failed: ${msg}\n`);
        process.exitCode = 1;
      }
    });
}
