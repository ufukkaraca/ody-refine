/**
 * Report command — generates HTML report from cached or fresh detections.
 * @module commands/report
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import type { Detection } from '@useody/platform-core';
import { loadConfig } from '../config/index.js';
import { createSpinner, openHtmlReport } from '../output/index.js';

/** Create the report command. */
export function createReportCommand(): Command {
  return new Command('report')
    .description('Generate an HTML report of detected issues')
    .option('--config <path>', 'Path to config file')
    .option('-o, --output <path>', 'Output file path')
    .option('--no-open', 'Do not open the report in the browser')
    .option('--fresh', 'Re-run detectors instead of using cached results')
    .addHelpText('after', `
Examples:
  $ ody-refine report                    Open report in browser
  $ ody-refine report -o audit.html      Save to specific file
  $ ody-refine report --no-open          Generate without opening
  $ ody-refine report --fresh            Re-detect before generating

Uses cached detections from the last ingest by default.
`)
    .action(async (opts: {
      config?: string; output?: string; open: boolean; fresh?: boolean;
    }) => {
      const spinner = createSpinner('Generating report...');
      spinner.start();

      const config = loadConfig(opts.config);

      try {
        const dbPath = resolve(config.dataDir, 'refine.db');
        if (!existsSync(dbPath)) {
          spinner.fail(
            `No database found at ${dbPath}. Run 'ody-refine ingest' first.`,
          );
          process.exit(1);
        }

        const core = await import('@useody/platform-core');
        const exportMod = await import('@useody/export');

        const db = core.openDatabase(dbPath);
        const row = db.prepare(
          'SELECT embedding_dim FROM knowledge_nodes LIMIT 1',
        ).get() as { embedding_dim: number } | undefined;
        const dim = row?.embedding_dim ?? 384;
        core.createSchema(db, dim);

        const nodeRepo = new core.SQLiteNodeRepository(db);
        const nodeCount = await nodeRepo.count();

        let detections: Detection[];

        if (!opts.fresh) {
          const { loadDetections } = await import(
            '../detect/detection-store.js'
          );
          const cached = loadDetections(db as never);
          if (cached) {
            detections = cached;
          } else {
            spinner.text = 'No cached results — running detectors...';
            detections = await freshDetect(core, db, dim, spinner);
          }
        } else {
          spinner.text = 'Running detectors...';
          detections = await freshDetect(core, db, dim, spinner);
        }

        spinner.text = 'Generating HTML...';
        const html = exportMod.generateHtmlReport(detections, {
          nodeCount,
          durationMs: 0,
        });

        const outPath = resolve(
          opts.output ?? resolve(config.dataDir, 'report.html'),
        );
        writeFileSync(outPath, html, 'utf-8');
        spinner.succeed(
          `Report generated: ${outPath} (${String(detections.length)} issues)`,
        );

        if (opts.open) {
          await openHtmlReport(outPath);
        }
        process.exit(0);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        spinner.fail(`Report generation failed: ${msg}`);
        process.exit(1);
      }
    });
}

/** Run fresh detection when no cache exists. */
async function freshDetect(
  core: typeof import('@useody/platform-core'),
  db: ReturnType<typeof core.openDatabase>,
  dim: number,
  spinner: { text: string },
): Promise<Detection[]> {
  const detectorsMod = await import('@useody/detectors');
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
    onProgress: (_name: string, status: string) => {
      spinner.text = status;
    },
  });
  return result.detections;
}
