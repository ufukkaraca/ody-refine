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
import type { Detection } from '@useody/platform-core';

/** Stored score from a previous CI run. */
interface LastScore {
  score: number;
  timestamp: string;
}

/** Simplified detection for CI output. */
export interface CiDetection {
  type: string;
  severity: string;
  description: string;
  suggestedAction?: string;
}

/** CI report output. */
export interface CiReport {
  score: number;
  previousScore: number | null;
  delta: number | null;
  detections: CiDetection[];
  pass: boolean;
}

/** Compute health score from detections (same algorithm as HTML report). */
export function computeCiScore(detections: Detection[]): number {
  if (detections.length === 0) return 100;
  const penalty = detections.reduce((sum, d) => {
    if (d.severity === 'critical') return sum + 15;
    if (d.severity === 'warning') return sum + 5;
    return sum + 1;
  }, 0);
  return Math.max(0, 100 - penalty);
}

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

/** Build the CI report object. */
export function buildCiReport(
  score: number,
  previousScore: LastScore | null,
  detections: Detection[],
  minHealth: number,
  failOnRegression: boolean,
): CiReport {
  const prevScore = previousScore?.score ?? null;
  const delta = prevScore !== null ? score - prevScore : null;

  let pass = true;
  if (score < minHealth) pass = false;
  if (failOnRegression && delta !== null && delta < 0) pass = false;

  const ciDetections: CiDetection[] = detections.map((d) => ({
    type: d.type,
    severity: d.severity,
    description: d.description,
    suggestedAction: d.suggestedAction,
  }));

  return { score, previousScore: prevScore, delta, detections: ciDetections, pass };
}

/** Format report as markdown for PR comments. */
export function formatMarkdown(report: CiReport): string {
  const status = report.pass ? 'PASS' : 'FAIL';
  const icon = report.pass ? '✅' : '❌';

  const lines: string[] = [
    `## ${icon} Ody Refine Health Report`,
    '',
    `**Score: ${String(report.score)}/100**`,
  ];

  if (report.previousScore !== null && report.delta !== null) {
    const arrow = report.delta > 0 ? '↑' : report.delta < 0 ? '↓' : '→';
    const sign = report.delta > 0 ? '+' : '';
    lines.push(
      `Previous: ${String(report.previousScore)} (${arrow} ${sign}${String(report.delta)})`,
    );
  }

  lines.push('');

  if (report.detections.length > 0) {
    lines.push('### Issues Found', '');
    lines.push('| Severity | Type | Description |');
    lines.push('|----------|------|-------------|');
    for (const d of report.detections) {
      lines.push(`| ${d.severity} | ${d.type} | ${d.description} |`);
    }
    lines.push('');
  } else {
    lines.push('No issues found. Your docs are healthy!', '');
  }

  lines.push(`**Result: ${status}**`);
  return lines.join('\n');
}

/** Options parsed from Commander. */
interface CiOptions {
  minHealth: string;
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
    .option('--fail-on-regression', 'Fail if score decreased since last run', false)
    .option('-o, --output <path>', 'Write JSON report to file')
    .option('--format <format>', 'Output format: json | markdown', 'json')
    .option('--config <path>', 'Path to config file')
    .action(async (directory: string, opts: CiOptions) => {
      const minHealth = parseInt(opts.minHealth, 10);
      if (isNaN(minHealth) || minHealth < 0 || minHealth > 100) {
        process.stderr.write('Error: --min-health must be 0-100\n');
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

        // Score + compare
        const score = computeCiScore(result.detections);
        const previous = loadPreviousScore(config.dataDir);
        const report = buildCiReport(
          score, previous, result.detections, minHealth, opts.failOnRegression,
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

        if (!report.pass) {
          process.exitCode = 1;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`CI pipeline failed: ${msg}\n`);
        process.exitCode = 1;
      }
    });
}
