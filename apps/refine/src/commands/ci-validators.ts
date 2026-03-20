/**
 * CI command validators and report builders.
 * Extracted from ci.ts to keep files under 250 lines.
 * @module commands/ci-validators
 */
import type { Detection } from '@useody/platform-core';

/** Stored score from a previous CI run. */
export interface LastScore {
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

/** Severity level threshold for --fail-on. */
export type FailOnLevel = 'critical' | 'warning' | 'info' | 'none';

/** Ordered severity levels (most to least severe). */
const SEVERITY_ORDER: readonly string[] = ['critical', 'warning', 'info'];

/** CI report output. */
export interface CiReport {
  score: number;
  previousScore: number | null;
  delta: number | null;
  detections: CiDetection[];
  pass: boolean;
  failedOn: FailOnLevel | null;
}

/** Options for building a CI report. */
export interface BuildReportOptions {
  minHealth: number;
  failOnRegression: boolean;
  failOn: FailOnLevel;
}

/** Valid values for --fail-on flag. */
export const VALID_FAIL_ON: readonly string[] = ['critical', 'warning', 'info', 'none'];

/**
 * Check if any detection meets or exceeds the fail-on severity threshold.
 * Returns the highest severity found that meets the threshold, or null if none.
 */
export function checkFailOnSeverity(
  detections: Detection[],
  failOn: FailOnLevel,
): FailOnLevel | null {
  if (failOn === 'none') return null;
  const threshold = SEVERITY_ORDER.indexOf(failOn);
  if (threshold < 0) return null;
  for (const sev of SEVERITY_ORDER.slice(0, threshold + 1)) {
    if (detections.some((d) => d.severity === sev)) {
      return sev as FailOnLevel;
    }
  }
  return null;
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

/** Build the CI report object. */
export function buildCiReport(
  score: number,
  previousScore: LastScore | null,
  detections: Detection[],
  minHealth: number,
  failOnRegression: boolean,
  failOn: FailOnLevel = 'none',
): CiReport {
  const prevScore = previousScore?.score ?? null;
  const delta = prevScore !== null ? score - prevScore : null;

  let pass = true;
  let failedOn: FailOnLevel | null = null;

  if (score < minHealth) pass = false;
  if (failOnRegression && delta !== null && delta < 0) pass = false;

  const severityHit = checkFailOnSeverity(detections, failOn);
  if (severityHit) {
    pass = false;
    failedOn = severityHit;
  }

  const ciDetections: CiDetection[] = detections.map((d) => ({
    type: d.type,
    severity: d.severity,
    description: d.description,
    suggestedAction: d.suggestedAction,
  }));

  return { score, previousScore: prevScore, delta, detections: ciDetections, pass, failedOn };
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

  if (report.failedOn) {
    lines.push(`> Failed due to **${report.failedOn}** severity detection(s)`, '');
  }

  lines.push(`**Result: ${status}**`);
  return lines.join('\n');
}
