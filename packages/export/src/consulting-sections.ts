/**
 * Section renderers for the consulting-grade health assessment report.
 * Section label, prioritized action plan with ROI estimate, and methodology note.
 * Re-exports executive summary and grouped findings from dedicated modules.
 * @module consulting-sections
 */

import type { ConsultingFinding, AnalysisResult } from './consulting-types.js';
import { EFFORT_LABELS } from './consulting-types.js';
import { escapeHtml } from './html-template.js';

export { renderExecSummary } from './consulting-exec-summary.js';
export { renderFindingsGrouped } from './consulting-findings.js';

/** Render a section label. */
export function sectionLabel(text: string): string {
  return `<div class="section-label">${escapeHtml(text)}</div>`;
}

/** Render the action plan with grouped effort tiers and ROI estimate. */
export function renderActionPlan(findings: ConsultingFinding[], score: number): string {
  if (findings.length === 0) return '';
  const effortOrder: Record<string, number> = { quick_win: 0, medium: 1, major: 2 };
  const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sorted = [...findings]
    .filter((f) => f.severity !== 'info')
    .sort((a, b) => (effortOrder[a.effort] ?? 9) - (effortOrder[b.effort] ?? 9)
      || (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));

  let lastEffort = '';
  const items = sorted.map((f, i) => {
    const effort = EFFORT_LABELS[f.effort];
    const effortLabel = effort ? effort.label : f.effort;
    const groupLabel = f.effort !== lastEffort
      ? `<div class="action-group-label">${escapeHtml(effortLabel)}s</div>` : '';
    lastEffort = f.effort;
    const refDocs = f.affectedDocuments.map((d) => d.split('/').pop() ?? d).join(', ');
    return `${groupLabel}<div class="action-item">
  <div class="action-num ${f.effort}">${String(i + 1)}</div>
  <div class="action-body">
    <div class="action-title">${escapeHtml(f.headline)}</div>
    <div class="action-detail">${escapeHtml(f.recommendation)} <span class="effort-badge" style="color:${effort?.color ?? '#5c4f42'};background:${effort?.bg ?? 'transparent'}">${escapeHtml(effortLabel)}</span></div>
    <div class="action-ref">${escapeHtml(refDocs)}</div>
  </div>
</div>`;
  }).join('\n');

  const quickWins = sorted.filter((f) => f.effort === 'quick_win').length;
  const projected = Math.min(100, score + quickWins * 5);
  const roiBanner = quickWins > 0 && projected > score
    ? `<div class="roi-banner">
  <p>Estimated impact of fixing all issues:</p>
  <strong>${String(score)} &rarr; ~${String(projected)}</strong>
  <p>${String(quickWins)} quick win${quickWins !== 1 ? 's' : ''} you can fix in under an hour</p>
</div>` : '';

  return `<div class="action-list">${items}</div>${roiBanner}`;
}

/** Render the methodology note. */
export function renderMethodology(meta: AnalysisResult['metadata']): string {
  const date = new Date(meta.analyzedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return `<div class="methodology">
  <p><strong>How This Analysis Was Performed</strong></p>
  <p>This assessment was conducted on ${escapeHtml(date)} using Ody Refine, which applies AI-powered analysis to identify inconsistencies, gaps, and risks across your documentation. The analysis examined <strong>${String(meta.documentCount)} documents</strong> using ${escapeHtml(meta.modelUsed)}, evaluating each document against all others for contradictions, staleness, ownership gaps, and coverage issues.</p>
  <p style="margin-top:0.5rem">Findings are prioritized by business impact. Each finding includes direct evidence from your documents and a specific recommendation. Run <code style="font-family:var(--font-mono);font-size:0.75rem;background:var(--bg-input);padding:1px 5px;border-radius:3px">ody-refine resolve</code> to fix issues interactively.</p>
</div>`;
}
