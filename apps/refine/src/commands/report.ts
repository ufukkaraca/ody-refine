/**
 * Report command — runs detectors and generates an HTML report.
 * @module commands/report
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { createSpinner, openHtmlReport } from '../output/index.js';

/** Create the report command. */
export function createReportCommand(): Command {
  return new Command('report')
    .description('Generate an HTML report of detected issues')
    .option('--config <path>', 'Path to config file')
    .option('-o, --output <path>', 'Output file path', 'report.html')
    .option('--no-open', 'Do not open the report in the browser')
    .action(async (opts: { config?: string; output: string; open: boolean }) => {
      const spinner = createSpinner('Generating report...');
      spinner.start();

      const config = loadConfig(opts.config);

      try {
        const dbPath = resolve(config.dataDir, 'refine.db');
        if (!existsSync(dbPath)) {
          spinner.fail(`No database found at ${dbPath}. Run 'ody-refine ingest' first.`);
          process.exitCode = 1;
          return;
        }

        const core = await import('@useody/platform-core');
        const detectorsMod = await import('@useody/detectors');
        const exportMod = await import('@useody/export');

        spinner.text = 'Loading knowledge graph...';
        const db = core.openDatabase(dbPath);
        const row = db.prepare(
          'SELECT embedding_dim FROM knowledge_nodes LIMIT 1',
        ).get() as { embedding_dim: number } | undefined;
        const dim = row?.embedding_dim ?? 384;
        core.createSchema(db, dim);

        const nodeRepo = new core.SQLiteNodeRepository(db);
        const edgeRepo = new core.SQLiteEdgeRepository(db);
        const vecIndex = new core.SqliteVecIndex(db, dim);

        spinner.text = 'Running detectors...';
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
          onProgress: (_name: string, status: string) => {
            spinner.text = status;
          },
        });

        spinner.text = 'Generating HTML report...';
        const totalDuration = result.stats.reduce((s, st) => s + st.durationMs, 0);
        const totalNodes = result.stats.reduce((s, st) => Math.max(s, st.nodeCount), 0);
        const html = exportMod.generateHtmlReport(result.detections, {
          nodeCount: totalNodes,
          durationMs: totalDuration,
        });

        const outPath = resolve(opts.output);
        writeFileSync(outPath, html, 'utf-8');
        spinner.succeed(`Report generated: ${outPath} (${String(result.detections.length)} issues)`);

        if (opts.open) {
          await openHtmlReport(outPath);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        spinner.fail(`Report generation failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}
