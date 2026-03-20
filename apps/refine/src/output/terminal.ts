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
const MAX_DESC = 72;

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
  /** Override the computed health score (use the same score as the report). */
  healthScore?: number;
}

/** Compute a health score 0–100 using exponential decay. */
function healthScore(detections: Detection[]): number {
  const count = (s: string): number => detections.filter((d) => d.severity === s).length;
  return Math.round(100 * Math.exp(-0.08 * count('critical') - 0.02 * count('warning') - 0.005 * count('info')));
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
  const label = score >= 80 ? 'Healthy' : score >= 60 ? 'Needs attention' : score >= 40 ? 'At risk' : 'Critical';
  const colorFn = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : score >= 40 ? chalk.hex('#FFA500') : chalk.red;
  return colorFn(`${score}/100 ${label}`);
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

/** Truncate a detection description for terminal display. */
function truncateDesc(desc: string): string {
  // Strip parenthetical context blocks that make output too wide
  const stripped = desc.replace(/\s*\(context:.*$/, '');
  if (stripped.length <= MAX_DESC) return stripped;
  return stripped.slice(0, MAX_DESC - 1) + '…';
}

/**
 * Print a summary of an ingestion run to the terminal.
 */
export function printIngestSummary(summary: IngestSummary): void {
  line();
  line(chalk.bold(' Ingestion'));
  line(SEP);
  line(`  Files scanned     ${chalk.cyan(String(summary.filesDiscovered))}`);
  line(`  Processed         ${chalk.green(String(summary.filesProcessed))}`);
  if (summary.filesSkipped > 0) {
    line(`  Cached            ${chalk.dim(String(summary.filesSkipped))}`);
  }
  line(`  Knowledge nodes   ${chalk.green(String(summary.nodesStored))}`);
  line(`  Relationships     ${chalk.green(String(summary.edgesCreated))}`);
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
  const score = opts.healthScore ?? healthScore(detections);

  // Header banner
  const parts: string[] = [chalk.bold('ody refine')];
  if (fileCount != null) parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`);
  if (durationMs != null) parts.push(fmtMs(durationMs));
  line();
  line(HEAVY);
  line(` ${parts.join(chalk.dim('  ·  '))}`);
  line(HEAVY);

  // Health score — centered and prominent
  line();
  line(`  ${scoreBar(score)}  ${scoreLabel(score)}`);
  line();

  // Totals line
  const totals: string[] = [];
  if (critical.length > 0) totals.push(chalk.red(`${critical.length} critical`));
  if (warnings.length > 0) totals.push(chalk.yellow(`${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`));
  if (info.length > 0) totals.push(chalk.dim(`${info.length} info`));
  if (totals.length === 0) totals.push(chalk.green('No issues found'));
  line(`  ${totals.join(chalk.dim('  ·  '))}`);

  // Critical block
  if (critical.length > 0) {
    line();
    line(SEP);
    line(chalk.red.bold(` CRITICAL`) + chalk.red(` (${critical.length})`));
    line(SEP);
    for (const d of critical.slice(0, maxPerSeverity)) {
      line(`  ${chalk.red('✖')} ${chalk.dim(`[${d.type}]`)} ${truncateDesc(d.description)}`);
    }
    if (critical.length > maxPerSeverity) {
      line(chalk.dim(`  … and ${critical.length - maxPerSeverity} more`));
    }
  }

  // Warning block
  if (warnings.length > 0) {
    line();
    line(SEP);
    line(chalk.yellow.bold(` WARNINGS`) + chalk.yellow(` (${warnings.length})`));
    line(SEP);
    for (const d of warnings.slice(0, maxPerSeverity)) {
      line(`  ${chalk.yellow('⚠')} ${chalk.dim(`[${d.type}]`)} ${truncateDesc(d.description)}`);
    }
    if (warnings.length > maxPerSeverity) {
      line(chalk.dim(`  … and ${warnings.length - maxPerSeverity} more`));
    }
  }

  // Info block
  if (info.length > 0) {
    line();
    line(SEP);
    line(chalk.blue.bold(` INFO`) + chalk.blue(` (${info.length})`));
    line(SEP);
    for (const d of info.slice(0, maxPerSeverity)) {
      line(`  ${chalk.blue('ℹ')} ${chalk.dim(`[${d.type}]`)} ${truncateDesc(d.description)}`);
    }
    if (info.length > maxPerSeverity) {
      line(chalk.dim(`  … and ${info.length - maxPerSeverity} more`));
    }
  }

  // Clean state
  if (detections.length === 0) {
    line();
    line(SEP);
    line(chalk.green('  ✔  Your docs are clean! No contradictions, staleness, or drift detected.'));
  }

  // Next steps
  line();
  line(SEP);
  line(chalk.bold(' What to do next'));
  line(SEP);
  if (reportPath) {
    line(`  ${chalk.dim('1.')} Open report    ${chalk.cyan(`open ${reportPath}`)}`);
    line(`  ${chalk.dim('2.')} Resolve issues ${chalk.cyan('ody-refine resolve')}`);
    line(`  ${chalk.dim('3.')} Export tickets ${chalk.cyan('ody-refine export --format tickets')}`);
    line(`  ${chalk.dim('4.')} Re-scan        ${chalk.cyan('ody-refine ingest .')}`);
  } else {
    line(`  ${chalk.dim('1.')} Generate report ${chalk.cyan('ody-refine report')}`);
    line(`  ${chalk.dim('2.')} Resolve issues  ${chalk.cyan('ody-refine resolve')}`);
    line(`  ${chalk.dim('3.')} Export tickets  ${chalk.cyan('ody-refine export --format tickets')}`);
    line(`  ${chalk.dim('4.')} Re-scan         ${chalk.cyan('ody-refine ingest .')}`);
  }
  line();
  line(chalk.dim('  Questions or feedback? github.com/ufukkaraca/ody-refine/discussions'));
  line();
  line(HEAVY);
  line();
}

/** Stats for printStatus display. */
export interface StatusStats {
  nodes: number;
  edges: number;
  resolutions: number;
  detections?: number;
  pairs?: number;
  pairsUnexported?: number;
}

/**
 * Print database status stats to the terminal.
 */
export function printStatus(
  stats: StatusStats,
  dbPath?: string,
): void {
  line();
  line(chalk.bold(' Knowledge Graph'));
  line(SEP);
  line(`  Nodes          ${chalk.cyan(String(stats.nodes))}`);
  line(`  Relationships  ${chalk.cyan(String(stats.edges))}`);
  if (stats.detections != null && stats.detections > 0) {
    line(`  Detections     ${chalk.yellow(String(stats.detections))}`);
  }
  if (stats.resolutions > 0) {
    line(`  Resolved       ${chalk.green(String(stats.resolutions))}`);
  }
  if (stats.pairs != null && stats.pairs > 0) {
    const unexported = stats.pairsUnexported ?? 0;
    const detail = unexported > 0
      ? ` ${chalk.dim(`(${String(unexported)} unexported)`)}`
      : '';
    line(`  Training pairs ${chalk.cyan(String(stats.pairs))}${detail}`);
  }
  if (dbPath) {
    line();
    line(chalk.dim(`  Database: ${dbPath}`));
  }
  line();
  if (stats.nodes === 0) {
    line(chalk.dim('  Run ody-refine ingest <directory> to get started.'));
    line();
  }
}

/** Create an ora spinner with a message. */
export function createSpinner(message: string): ReturnType<typeof ora> {
  return ora({ text: message, spinner: 'dots' });
}
