/**
 * Export command — exports knowledge data to JSONL format.
 * @module commands/export
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { createSpinner } from '../output/index.js';

/** Create the export command. */
export function createExportCommand(): Command {
  return new Command('export')
    .description('Export knowledge data to JSONL format')
    .option('--config <path>', 'Path to config file')
    .option('-o, --output <path>', 'Output file path', 'export.jsonl')
    .option(
      '--format <type>',
      'Export format: nodes, pairs, trl, sft, tickets, tickets-json',
      'nodes',
    )
    .option('--min-confidence <n>', 'Minimum confidence threshold', '0')
    .addHelpText('after', `
Examples:
  $ ody-refine export                            Export all nodes as JSONL
  $ ody-refine export -o data.jsonl              Save to a specific file
  $ ody-refine export --format sft               Export for fine-tuning (SFT)
  $ ody-refine export --min-confidence 0.8       High-confidence nodes only

Requires a prior 'ody-refine ingest' run.
`)
    .action(
      async (opts: {
        config?: string;
        output: string;
        format: string;
        minConfidence: string;
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
              process.exit(1);
            }
            const { generateTickets, ticketsToMarkdown, ticketsToJson } = exportPkg;
            const tickets = generateTickets(cached);
            content = opts.format === 'tickets'
              ? ticketsToMarkdown(tickets)
              : ticketsToJson(tickets);
            const ext = opts.format === 'tickets' ? '.md' : '.json';
            const ticketPath = outPath.replace(/\.\w+$/, ext);
            writeFileSync(ticketPath, content, 'utf-8');
            spinner.succeed(`Exported ${String(tickets.length)} tickets to ${ticketPath}`);
            process.exit(0);
          }

          if (opts.format === 'pairs') {
            content = exportPkg.exportPreferencePairsToJsonl([]);
          } else if (opts.format === 'trl') {
            content = exportPkg.exportTrlDpoToJsonl([]);
          } else if (opts.format === 'sft') {
            const nodes = await nodeRepo.findAll({ minConfidence: minConf });
            content = exportPkg.exportSftToJsonl(nodes, {
              filterByConfidence: minConf,
            });
          } else {
            const nodes = await nodeRepo.findAll({ minConfidence: minConf });
            content = exportPkg.exportNodesToJsonl(nodes, {
              format: 'jsonl',
              filterByConfidence: minConf,
            });
          }

          writeFileSync(outPath, content, 'utf-8');
          spinner.succeed(`Exported to ${outPath}`);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          spinner.fail(`Export failed: ${msg}`);
          process.exitCode = 1;
        }
      },
    );
}
