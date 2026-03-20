/**
 * Export command — exports knowledge data to JSONL format.
 * Supports combined output with preference pairs from resolve step.
 * @module commands/export
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { createSpinner } from '../output/index.js';
import { safeWriteFileSync } from '../safe-write.js';

/** Load preference pairs from SQLite if the table exists. */
async function loadPairsFromDb(db: unknown): Promise<{
  pairs: import('@useody/platform-core').PreferencePair[];
  count: number;
}> {
  const { PreferencePairStore } = await import('@useody/feedback');
  const store = new PreferencePairStore(db);
  const pairs = store.findAll();
  return { pairs, count: pairs.length };
}

/** Create the export command. */
export function createExportCommand(): Command {
  return new Command('export')
    .description('Export knowledge data to JSONL format')
    .option('--config <path>', 'Path to config file')
    .option('-o, --output <path>', 'Output file path', 'export.jsonl')
    .option(
      '--format <type>',
      'Export format: nodes, pairs, dpo, trl, sft, tickets, tickets-json',
      'nodes',
    )
    .option('--min-confidence <n>', 'Minimum confidence threshold', '0')
    .option(
      '--with-resolutions',
      'Include preference pairs from resolve step (auto-detected by default)',
    )
    .option(
      '--no-with-resolutions',
      'Exclude preference pairs even if they exist',
    )
    .addHelpText('after', `
Examples:
  $ ody-refine export                            Export all nodes as JSONL
  $ ody-refine export -o data.jsonl              Save to a specific file
  $ ody-refine export --format sft               Export for fine-tuning (SFT)
  $ ody-refine export --format dpo               Export DPO preference pairs
  $ ody-refine export --format trl               Export TRL DPO format (Forge)
  $ ody-refine export --with-resolutions         Include resolve pairs
  $ ody-refine export --no-with-resolutions      Exclude resolve pairs
  $ ody-refine export --min-confidence 0.8       High-confidence nodes only

Requires a prior 'ody-refine ingest' run.
`)
    .action(
      async (opts: {
        config?: string;
        output: string;
        format: string;
        minConfidence: string;
        withResolutions?: boolean;
      }) => {
        const spinner = createSpinner('Exporting data...');
        spinner.start();

        const config = loadConfig(opts.config);

        try {
          const dbPath = resolve(config.dataDir, 'refine.db');
          if (!existsSync(dbPath)) {
            spinner.fail(
              `No database found at ${dbPath}. Run 'ody-refine ingest' first.`,
            );
            process.exitCode = 1;
            return;
          }

          const core = await import('@useody/platform-core');
          const exportPkg = await import('@useody/export');
          const db = core.openDatabase(dbPath);
          const dim = 768;
          core.createSchema(db, dim);

          const nodeRepo = new core.SQLiteNodeRepository(db);
          const outPath = resolve(opts.output);
          const minConfidence = parseFloat(opts.minConfidence);
          const minConf = minConfidence > 0 ? minConfidence : undefined;

          spinner.text = `Exporting from ${dbPath}...`;

          let content = '';

          // Ticket export formats use cached detections
          if (opts.format === 'tickets' || opts.format === 'tickets-json') {
            const { loadDetections } = await import('../detect/detection-store.js');
            const cached = loadDetections(db as never);
            if (!cached || cached.length === 0) {
              spinner.fail('No cached detections. Run ingest first.');
              db.close();
              process.exitCode = 1;
              return;
            }
            const { generateTickets, ticketsToMarkdown, ticketsToJson } = exportPkg;
            const tickets = generateTickets(cached);
            content = opts.format === 'tickets'
              ? ticketsToMarkdown(tickets)
              : ticketsToJson(tickets);
            const ext = opts.format === 'tickets' ? '.md' : '.json';
            const ticketPath = outPath.replace(/\.\w+$/, ext);
            safeWriteFileSync(ticketPath, content);
            spinner.succeed(`Exported ${String(tickets.length)} tickets to ${ticketPath}`);
            db.close();
            return;
          }

          // DPO export marks pairs as exported
          if (opts.format === 'dpo') {
            const { PreferencePairStore } = await import('@useody/feedback');
            const pairStore = new PreferencePairStore(db);
            const unexported = pairStore.countUnexported();
            if (unexported === 0) {
              spinner.fail(
                'No unexported preference pairs. Resolve contradictions first.',
              );
              process.exitCode = 1;
              return;
            }
            const dpoPath = outPath.endsWith('.jsonl')
              ? outPath
              : outPath.replace(/\.\w+$/, '.jsonl');
            const exported = pairStore.exportDpo(dpoPath);
            spinner.succeed(
              `Exported ${String(exported)} DPO preference pair(s) to ${dpoPath}`,
            );
            return;
          }

          // TRL format: preference pairs only (prompt/chosen/rejected)
          if (opts.format === 'trl') {
            const { pairs, count } = await loadPairsFromDb(db);
            if (count === 0) {
              spinner.fail(
                'No preference pairs found. Run \'ody-refine resolve\' first.',
              );
              process.exitCode = 1;
              return;
            }
            content = exportPkg.exportTrlDpoToJsonl(pairs);
            safeWriteFileSync(outPath, content);
            spinner.succeed(
              `Exported ${String(count)} TRL DPO preference pair(s) to ${outPath}`,
            );
            return;
          }

          if (opts.format === 'pairs') {
            const { pairs, count } = await loadPairsFromDb(db);
            content = exportPkg.exportPreferencePairsToJsonl(pairs);
            safeWriteFileSync(outPath, content);
            spinner.succeed(
              `Exported ${String(count)} preference pair(s) to ${outPath}`,
            );
            return;
          }

          if (opts.format === 'sft') {
            const nodes = await nodeRepo.findAll({ minConfidence: minConf });
            content = exportPkg.exportSftToJsonl(nodes, {
              filterByConfidence: minConf,
            });
            safeWriteFileSync(outPath, content);
            spinner.succeed(`Exported to ${outPath}`);
            return;
          }

          // Default: nodes format, with optional resolution pairs
          const nodes = await nodeRepo.findAll({ minConfidence: minConf });

          // Auto-detect: include resolutions if they exist and flag not explicitly false
          const shouldIncludeResolutions = opts.withResolutions !== false;
          let pairCount = 0;

          if (shouldIncludeResolutions) {
            const { pairs, count } = await loadPairsFromDb(db);
            pairCount = count;

            if (count > 0) {
              content = exportPkg.exportCombinedToJsonl(nodes, pairs, {
                format: 'jsonl',
                filterByConfidence: minConf,
              });
            } else {
              content = exportPkg.exportNodesToJsonl(nodes, {
                format: 'jsonl',
                filterByConfidence: minConf,
              });
            }
          } else {
            content = exportPkg.exportNodesToJsonl(nodes, {
              format: 'jsonl',
              filterByConfidence: minConf,
            });
          }

          safeWriteFileSync(outPath, content);

          const nodeCount = nodes.filter(
            (n) => n.confidence >= (minConf ?? 0),
          ).length;

          if (pairCount > 0) {
            spinner.succeed(
              `Exported ${String(nodeCount)} node(s) + ${String(pairCount)} preference pair(s) to ${outPath}`,
            );
          } else {
            spinner.succeed(`Exported ${String(nodeCount)} node(s) to ${outPath}`);
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          spinner.fail(`Export failed: ${msg}`);
          process.exitCode = 1;
        }
      },
    );
}
