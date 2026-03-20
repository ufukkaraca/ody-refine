/**
 * Executive summary renderer for the consulting-grade health assessment.
 * Ghost-slide verdict with punchy one-liner and before/after score trajectory.
 * @module consulting-exec-summary
 */

import type { AnalysisResult } from './consulting-types.js';
import { escapeHtml } from './html-template.js';

/**
 * Build a punchy one-sentence verdict that makes someone say "oh shit".
 * Pattern: "Your docs say X and also Y. Someone is wrong."
 */
export function buildPunchyVerdict(result: AnalysisResult): string {
  const { findings, healthScore, metadata } = result;
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const score = healthScore.overall;

  // If the score is healthy, use a positive-but-qualified message
  if (score >= 80 && critical === 0) {
    return `${String(metadata.documentCount)} documents scanned. Your knowledge base is in good shape — but ${String(findings.length)} issue${findings.length !== 1 ? 's' : ''} still need${findings.length === 1 ? 's' : ''} attention.`;
  }

  // Build a concrete contradiction-based zinger when possible
  const contradictions = findings.filter((f) => f.category === 'contradiction');
  if (contradictions.length > 0 && contradictions[0]!.evidence.length >= 2) {
    const top = contradictions[0]!;
    const claimA = top.evidence[0]!.quote;
    const claimB = top.evidence[1]!.quote;
    // Truncate long quotes to keep it punchy
    const truncate = (s: string, max: number): string =>
      s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
    return `One doc says \u201C${truncate(claimA, 60)}\u201D Another says \u201C${truncate(claimB, 60)}\u201D Both can\u2019t be right.`;
  }

  // Fallback: alarming stats
  if (critical > 0) {
    return `${String(critical)} critical issue${critical !== 1 ? 's' : ''} found across ${String(metadata.documentCount)} documents. Your team is reading contradictory information right now.`;
  }

  return `${String(findings.length)} issue${findings.length !== 1 ? 's' : ''} found across ${String(metadata.documentCount)} documents — and your team probably doesn\u2019t know yet.`;
}

/**
 * Render the ghost-slide executive summary.
 * Leads with a punchy one-sentence verdict, then context with before/after indicator.
 */
export function renderExecSummary(result: AnalysisResult): string {
  const { findings, metadata, healthScore } = result;
  if (findings.length === 0) return '';

  const verdict = buildPunchyVerdict(result);

  // Context sentence
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const categories = new Set(findings.map((f) => f.category)).size;
  let context = `Across ${String(metadata.documentCount)} documents, this assessment identified `;
  context += `<strong>${String(findings.length)} issue${findings.length !== 1 ? 's' : ''}</strong>`;
  context += ` across ${String(categories)} categor${categories !== 1 ? 'ies' : 'y'}`;
  if (critical > 0) {
    context += `, including <strong>${String(critical)} critical</strong> finding${critical !== 1 ? 's' : ''}`;
  }
  context += '.';

  // Estimated projected score: quick wins, or medium fixes, or total
  const quickWins = findings.filter((f) => f.effort === 'quick_win').length;
  const mediumFixes = findings.filter((f) => f.effort === 'medium').length;
  const fixable = quickWins > 0 ? quickWins : mediumFixes;
  const projectedScore = Math.min(100, healthScore.overall + fixable * 5);
  const hasImprovement = projectedScore > healthScore.overall;
  const fixLabel = quickWins > 0 ? 'after fixing quick wins' : 'after resolving key issues';
  const scoreIndicator = hasImprovement
    ? `<div class="score-trajectory">
  <span class="trajectory-current">${String(healthScore.overall)}</span>
  <span class="trajectory-arrow">&rarr;</span>
  <span class="trajectory-projected">~${String(projectedScore)}</span>
  <span class="trajectory-label">${fixLabel}</span>
</div>` : '';

  const hasCritical = critical > 0;
  const isHealthy = healthScore.overall >= 80 && !hasCritical;
  const verdictLineClass = isHealthy ? 'verdict-line healthy' : 'verdict-line';

  const stats = [
    `<div class="exec-stat"><div class="exec-stat-value">${String(metadata.documentCount)}</div><div class="exec-stat-label">Documents</div></div>`,
    `<div class="exec-stat"><div class="exec-stat-value">${String(findings.length)}</div><div class="exec-stat-label">Issues</div></div>`,
    `<div class="exec-stat"><div class="exec-stat-value">${String(healthScore.overall)}</div><div class="exec-stat-label">Health Score</div></div>`,
    `<div class="exec-stat"><div class="exec-stat-value">${String(categories)}</div><div class="exec-stat-label">Categories</div></div>`,
  ].join('\n');

  return `<div class="exec-card">
  <p class="ghost-slide">${escapeHtml(verdict)}</p>
  <div class="${verdictLineClass}"></div>
  <p class="exec-context">${context}</p>
  ${scoreIndicator}
  <div class="exec-stats">${stats}</div>
</div>`;
}
