/**
 * CI command — runs pipeline and outputs machine-readable results.
 * No spinners, no browser. Designed for GitHub Actions and CI pipelines.
 * @module commands/ci
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { detectEmbeddingProvider } from '../config/auto-detect.js';
import {
  computeCiScore,
  buildCiReport,
  formatMarkdown,
  VALID_FAIL_ON,
} from './ci-validators.js';
import type { FailOnLevel, LastScore } from './ci-validators.js';

// Re-export for backward compatibility (tests import from ci.js)
export {
  computeCiScore,
  buildCiReport,
  formatMarkdown,
  checkFailOnSeverity,
} from './ci-validators.js';
export type {
  CiDetection,
  CiReport,
  FailOnLevel,
  LastScore,
  BuildReportOptions,
} from './ci-validators.js';

/** Load previous score from last-score.json. */
function loadPreviousScore(dataDir: string): LastScore | null {
  const scorePath = resolve(dataDir, 'last-score.json');
  if (!existsSync(scorePath)) return null;
  try {
    const raw = readFileSync(scorePath, 'utf-8');
    return JSON.parse(raw) as LastScore;
  } catch {
    return null;
  }
}

/** Save current score to last-score.json. */
function saveScore(dataDir: string, score: number): void {
  const scorePath = resolve(dataDir, 'last-score.json');
  const data: LastScore = { score, timestamp: new Date().toISOString() };
  writeFileSync(scorePath, JSON.stringify(data, null, 2), 'utf-8');
}

/** Options parsed from Commander. */
interface CiOptions {
  minHealth: string;
  failOn: string;
  failOnRegression: boolean;
  output?: string;
  format: string;
  config?: string;
}

/** Create the ci command. */
export function createCiCommand(): Command {
  return new Command('ci')
    .description('Run health check for CI pipelines (no browser, machine output)')
    .argument('[directory]', 'Directory to scan', '.')
    .option('--min-health <number>', 'Minimum health score (0-100)', '70')
    .option('--fail-on <level>', 'Fail on severity (critical, warning, info, none)', 'critical')
    .option('--fail-on-regression', 'Fail if score decreased since last run', false)
    .option('-o, --output <path>', 'Write JSON report to file')
    .option('--format <format>', 'Output format: json | markdown', 'json')
    .option('--config <path>', 'Path to config file')
    .addHelpText('after', `
Examples:
  $ ody-refine ci ./docs/                        Run with defaults (fail on critical)
  $ ody-refine ci ./docs/ --fail-on warning      Fail on warnings too
  $ ody-refine ci ./docs/ --fail-on none         Report only, never fail
  $ ody-refine ci ./docs/ --min-health 80        Stricter score threshold
  $ ody-refine ci . --fail-on-regression         Fail if score dropped
  $ ody-refine ci . --format markdown            PR comment format
  $ ody-refine ci . -o report.json               Save JSON report to file

Exit code 0 = pass, 1 = fail. Designed for GitHub Actions, GitLab CI, etc.
`)
    .action(async (directory: string, opts: CiOptions) => {
      const minHealth = parseInt(opts.minHealth, 10);
      if (isNaN(minHealth) || minHealth < 0 || minHealth > 100) {
        process.stderr.write('Error: --min-health must be 0-100\n');
        process.exitCode = 1;
        return;
      }

      const failOn = opts.failOn as FailOnLevel;
      if (!VALID_FAIL_ON.includes(failOn)) {
        process.stderr.write(
          `Error: --fail-on must be one of: ${VALID_FAIL_ON.join(', ')}\n`,
        );
        process.exitCode = 1;
        return;
      }

      const config = loadConfig(opts.config);
      const absDir = resolve(directory);

      try {
        const embeddingProvider = await detectEmbeddingProvider(config);
        if (!embeddingProvider) {
          process.stderr.write(
            'Error: No embedding provider available.\n' +
            '  Set OPENAI_API_KEY or COHERE_API_KEY for CI environments.\n',
          );
          process.exitCode = 1;
          return;
        }

        const core = await import('@useody/platform-core');
        mkdirSync(config.dataDir, { recursive: true });
        const dbPath = resolve(config.dataDir, 'refine.db');
        const db = core.openDatabase(dbPath);
        const dim = embeddingProvider.getDimension();
        core.createSchema(db, dim);

        const nodeRepo = new core.SQLiteNodeRepository(db);
        const edgeRepo = new core.SQLiteEdgeRepository(db);
        const vecIndex = new core.SqliteVecIndex(db, dim);
        const { SQLiteIngestLog } = await import('../ingest/ingest-log.js');
        const ingestLog = new SQLiteIngestLog(db);

        // Ingest (silent — no spinners in CI)
        const { ingestDirectory } = await import('../ingest/pipeline.js');
        await ingestDirectory({
          directory: absDir,
          nodeRepo,
          edgeRepo,
          vecIndex,
          embeddingProvider,
          ingestLog,
        });

        // Detect
        const detectorsMod = await import('@useody/detectors');
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

        // Deduplicate detections (edges + heuristics may flag the same pair)
        const seen = new Set<string>();
        const deduped = result.detections.filter((d) => {
          const ids = [...d.nodeIds].sort().join(',');
          const key = `${d.type}:${ids}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Score + compare
        const score = computeCiScore(deduped);
        const previous = loadPreviousScore(config.dataDir);
        const report = buildCiReport(
          score, previous, deduped, minHealth, opts.failOnRegression, failOn,
        );

        saveScore(config.dataDir, score);

        // Output
        const output = opts.format === 'markdown'
          ? formatMarkdown(report)
          : JSON.stringify(report, null, 2);

        process.stdout.write(output + '\n');

        if (opts.output) {
          writeFileSync(resolve(opts.output), output, 'utf-8');
        }

        db.close();
        process.exitCode = report.pass ? 0 : 1;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`CI pipeline failed: ${msg}\n`);
        process.exitCode = 1;
      }
    });
}
