/**
 * Resolve command — launches the interactive TUI to resolve detected issues.
 * @module commands/resolve
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { createSpinner } from '../output/index.js';

/** Create the resolve command. */
export function createResolveCommand(): Command {
  return new Command('resolve')
    .description('Interactively resolve detected issues (TUI)')
    .option('--config <path>', 'Path to config file')
    .option('--auto', 'Auto-resolve high-confidence issues')
    .addHelpText('after', `
Examples:
  $ ody-refine resolve                 Interactive TUI for each issue
  $ ody-refine resolve --auto          Auto-resolve high-confidence issues

Requires a prior 'ody-refine ingest' run.
`)
    .action(async (opts: { config?: string; auto?: boolean }) => {
      const spinner = createSpinner('Loading detections...');
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
        const detectorsMod = await import('@useody/detectors');

        const db = core.openDatabase(dbPath);
        const row = db.prepare(
          'SELECT embedding_dim FROM knowledge_nodes LIMIT 1',
        ).get() as { embedding_dim: number } | undefined;
        const dim = row?.embedding_dim ?? 384;
        core.createSchema(db, dim);

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

        spinner.succeed(`Found ${String(result.detections.length)} detection(s)`);

        if (result.detections.length === 0) {
          process.stdout.write('No issues to resolve.\n');
          return;
        }

        // Auto-resolve mode: resolve info-level and auto-resolvable issues
        if (opts.auto) {
          const { autoResolve } = await import('../resolve/auto-resolve.js');
          const { resolved, remaining } = autoResolve(result.detections);
          if (resolved.length > 0) {
            const { saveResolutions } = await import('../resolve/save-resolutions.js');
            saveResolutions(db, resolved.map((d) => ({
              detectionType: d.type,
              nodeIds: d.nodeIds,
              action: 'dismissed',
              reason: 'Auto-resolved (info severity or flagged auto-resolvable)',
            })));
            process.stdout.write(
              `Auto-resolved ${String(resolved.length)} issue(s). ${String(remaining.length)} remaining.\n`,
            );
          }
          if (remaining.length === 0) return;
          // Fall through to TUI for remaining issues
          result.detections = remaining;
        }

        // Launch Ink TUI
        const { render } = await import('ink');
        const React = await import('react');
        const { ResolveTui } = await import('../resolve/tui.js');
        const { saveResolutions } = await import('../resolve/save-resolutions.js');

        const { waitUntilExit } = render(
          React.createElement(ResolveTui, {
            detections: result.detections,
            onComplete: (resolutions) => {
              const records = resolutions.map((r) => ({
                detectionType: r.detection.type,
                nodeIds: r.detection.nodeIds,
                action: r.action as 'keep' | 'dismissed' | 'resolved',
                reason: `User chose: ${r.action}`,
              }));
              saveResolutions(db, records);
              process.stdout.write(
                `\nResolved ${String(resolutions.length)} detection(s).\n`,
              );
            },
          }),
        );

        await waitUntilExit();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        spinner.fail(`Resolve failed: ${msg}`);
        process.exitCode = 1;
      }
    });
}
