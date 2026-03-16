/**
 * Terminal output helpers using ora and chalk.
 * @module output/terminal
 */
import chalk from 'chalk';
import ora from 'ora';
import type { IngestSummary } from '../ingest/pipeline.js';
import type { Detection } from '@useody/platform-core';

const W = 56;
const SEP = chalk.dim('─'.repeat(W));
const HEAVY = chalk.dim('━'.repeat(W));

/** Options for printDetectionSummary. */
export interface SummaryOptions {
  /** Total elapsed ms from pipeline start to end. */
  durationMs?: number;
  /** Number of files scanned in this run. */
  fileCount?: number;
  /** Path to the generated HTML report. */
  reportPath?: string;
  /** Max items to display per severity level (default: 5). */
  maxPerSeverity?: number;
}

/** Compute a health score 0–100 using exponential decay. */
function healthScore(detections: Detection[]): number {
  const c = detections.filter((d) => d.severity === 'critical').length;
  const w = detections.filter((d) => d.severity === 'warning').length;
  const i = detections.filter((d) => d.severity === 'info').length;
  return Math.round(100 * Math.exp(-0.08 * c - 0.02 * w - 0.005 * i));
}

/** Render a 10-block progress bar for a score. */
function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  if (score >= 80) return chalk.green(bar);
  if (score >= 60) return chalk.yellow(bar);
  if (score >= 40) return chalk.hex('#FFA500')(bar);
  return chalk.red(bar);
}

/** Colorize score and label. */
function scoreLabel(score: number): string {
  const label = score >= 80 ? 'Healthy'
    : score >= 60 ? 'Needs attention'
    : score >= 40 ? 'Poor'
    : 'Critical issues';
  const colorFn = score >= 80 ? chalk.green
    : score >= 60 ? chalk.yellow
    : score >= 40 ? chalk.hex('#FFA500')
    : chalk.red;
  return colorFn(`${score} / 100  ${label}`);
}

/** Format milliseconds as a compact human-readable duration. */
function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Write a line of text to stdout. */
function line(text = ''): void {
  process.stdout.write(text + '\n');
}

/**
 * Print a summary of an ingestion run to the terminal.
 */
export function printIngestSummary(summary: IngestSummary): void {
  line();
  line(chalk.bold('Ingestion'));
  line(SEP);
  line(`  Files discovered:  ${chalk.cyan(String(summary.filesDiscovered))}`);
  line(`  Processed:         ${chalk.green(String(summary.filesProcessed))}`);
  line(`  Skipped (cached):  ${chalk.dim(String(summary.filesSkipped))}`);
  line(`  Nodes stored:      ${chalk.green(String(summary.nodesStored))}`);
  line(`  Relationships:     ${chalk.green(String(summary.edgesCreated))}`);
  line();
}

/**
 * Print a full detection summary with health score, grouped findings,
 * and next-steps guidance.
 */
export function printDetectionSummary(
  detections: Detection[],
  opts: SummaryOptions = {},
): void {
  const { durationMs, fileCount, reportPath, maxPerSeverity = 5 } = opts;
  const critical = detections.filter((d) => d.severity === 'critical');
  const warnings = detections.filter((d) => d.severity === 'warning');
  const info = detections.filter((d) => d.severity === 'info');
  const score = healthScore(detections);

  // Header banner
  const parts: string[] = [chalk.bold('ody-refine')];
  if (fileCount != null) parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`);
  if (durationMs != null) parts.push(fmtMs(durationMs));
  line();
  line(HEAVY);
  line(` ${parts.join('  ·  ')}`);
  line(HEAVY);

  // Health score
  line();
  line(` Health Score   ${scoreLabel(score)}  ${scoreBar(score)}`);
  line();

  // Totals line
  const totals: string[] = [];
  if (critical.length > 0) totals.push(chalk.red(`${critical.length} critical`));
  if (warnings.length > 0) totals.push(chalk.yellow(`${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`));
  if (info.length > 0) totals.push(chalk.blue(`${info.length} info`));
  if (totals.length === 0) totals.push(chalk.green('No issues found'));
  line(` ${totals.join('  ·  ')}`);

  // Critical block
  if (critical.length > 0) {
    line();
    line(SEP);
    line(chalk.red.bold(` CRITICAL  ${critical.length}`));
    line(SEP);
    for (const d of critical.slice(0, maxPerSeverity)) {
      line(`  ${chalk.red('✖')} ${chalk.dim(`[${d.type}]`)} ${d.description}`);
    }
    if (critical.length > maxPerSeverity) {
      line(chalk.dim(`  … and ${critical.length - maxPerSeverity} more critical`));
    }
  }

  // Warning block
  if (warnings.length > 0) {
    line();
    line(SEP);
    line(chalk.yellow.bold(` WARNINGS  ${warnings.length}`));
    line(SEP);
    for (const d of warnings.slice(0, maxPerSeverity)) {
      line(`  ${chalk.yellow('⚠')} ${chalk.dim(`[${d.type}]`)} ${d.description}`);
    }
    if (warnings.length > maxPerSeverity) {
      line(chalk.dim(`  … and ${warnings.length - maxPerSeverity} more warnings`));
    }
  }

  // Info block
  if (info.length > 0) {
    line();
    line(SEP);
    line(chalk.blue.bold(` INFO  ${info.length}`));
    line(SEP);
    for (const d of info.slice(0, maxPerSeverity)) {
      line(`  ${chalk.blue('ℹ')} ${chalk.dim(`[${d.type}]`)} ${d.description}`);
    }
    if (info.length > maxPerSeverity) {
      line(chalk.dim(`  … and ${info.length - maxPerSeverity} more`));
    }
  }

  // Clean state
  if (detections.length === 0) {
    line();
    line(SEP);
    line(chalk.green('  ✔  No issues found — your docs look great!'));
  }

  // Next steps
  line();
  line(SEP);
  line(chalk.bold(' Next steps'));
  line(SEP);
  if (reportPath) {
    line(`  1. View report:    ${chalk.cyan(`open ${reportPath}`)}`);
    line(`  2. Fix issues:     ${chalk.cyan('ody-refine resolve')}`);
    line(`  3. Re-scan:        ${chalk.cyan('ody-refine ingest .')}`);
  } else {
    line(`  1. Fix issues:     ${chalk.cyan('ody-refine resolve')}`);
    line(`  2. View report:    ${chalk.cyan('ody-refine report')}`);
    line(`  3. Re-scan:        ${chalk.cyan('ody-refine ingest .')}`);
  }
  line();
  line(HEAVY);
  line();
}

/**
 * Print database status stats to the terminal.
 */
export function printStatus(stats: { nodes: number; edges: number; resolutions: number }): void {
  line();
  line(chalk.bold('Database Status'));
  line(SEP);
  line(`  Knowledge nodes:  ${chalk.cyan(String(stats.nodes))}`);
  line(`  Edges:            ${chalk.cyan(String(stats.edges))}`);
  line(`  Resolutions:      ${chalk.cyan(String(stats.resolutions))}`);
  line();
}

/** Create an ora spinner with a message. */
export function createSpinner(message: string): ReturnType<typeof ora> {
  return ora(message);
}
