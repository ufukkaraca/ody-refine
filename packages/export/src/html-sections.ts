/**
 * Report section renderers for the consulting-grade health report.
 * Executive summary, findings, risk register, and action plan.
 * @module html-sections
 */

import type { Detection } from '@useody/platform-core';
import { escapeHtml } from './html-template.js';
import { buildRiskRegister } from './html-charts.js';

/** Human-readable labels for detection types. */
const TYPE_LABELS: Record<string, string> = {
  contradiction: 'Contradictions',
  duplicate: 'Duplicates',
  staleness: 'Stale Content',
  undocumented: 'Undocumented Areas',
  time_bomb: 'Time Bombs',
};

/** Severity weight for sorting type groups. */
const TYPE_WEIGHT: Record<string, number> = {
  contradiction: 0, time_bomb: 1, staleness: 2, duplicate: 3, undocumented: 4,
};

/** Get the human-readable label for a detection type. */
export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/** Group detections by type, sorted by severity weight. */
export function groupByType(detections: Detection[]): Map<string, Detection[]> {
  const groups = new Map<string, Detection[]>();
  for (const d of detections) {
    const list = groups.get(d.type) ?? [];
    list.push(d);
    groups.set(d.type, list);
  }
  const sevOrd: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sorted = new Map(
    Array.from(groups.entries()).sort(
      (a, b) => (TYPE_WEIGHT[a[0]] ?? 9) - (TYPE_WEIGHT[b[0]] ?? 9),
    ),
  );
  for (const [type, dets] of sorted) {
    sorted.set(type, dets.sort((a, b) => (sevOrd[a.severity] ?? 9) - (sevOrd[b.severity] ?? 9)));
  }
  return sorted;
}

/** Render a numbered section header. */
export function renderSectionHeader(num: string, title: string): string {
  return `<div class="section-header">
  <span class="section-num">${escapeHtml(num)}</span>
  <h2>${escapeHtml(title)}</h2>
</div>`;
}

/** Render the executive summary with key statistics. */
export function renderExecutiveSummary(
  detections: Detection[],
  stats?: { nodeCount: number; durationMs: number; docTypeCounts?: Record<string, number> },
): string {
  if (detections.length === 0) return '';
  const critical = detections.filter((d) => d.severity === 'critical').length;
  const warnings = detections.filter((d) => d.severity === 'warning').length;
  const types = new Set(detections.map((d) => d.type));
  const nodeCount = stats?.nodeCount ?? null;
  const nodeText = nodeCount !== null ? `${String(nodeCount)} documents` : 'your knowledge base';

  let text = `We analyzed ${nodeText} and found <strong>${String(detections.length)} `;
  text += `issue${detections.length !== 1 ? 's' : ''}</strong>`;
  text += ` across ${String(types.size)} categor${types.size !== 1 ? 'ies' : 'y'}.`;
  const parts: string[] = [];
  if (critical > 0) parts.push(`<strong>${String(critical)} critical</strong> requiring immediate attention`);
  if (warnings > 0) parts.push(`${String(warnings)} warning${warnings !== 1 ? 's' : ''}`);
  if (parts.length > 0) text += ` This includes ${parts.join(' and ')}.`;

  const statCards: string[] = [];
  if (nodeCount !== null) statCards.push(`<div class="exec-stat"><div class="exec-stat-value">${String(nodeCount)}</div><div class="exec-stat-label">Documents</div></div>`);
  statCards.push(`<div class="exec-stat"><div class="exec-stat-value">${String(detections.length)}</div><div class="exec-stat-label">Issues Found</div></div>`);
  if (critical > 0) statCards.push(`<div class="exec-stat"><div class="exec-stat-value" style="color:#DC2626">${String(critical)}</div><div class="exec-stat-label">Critical</div></div>`);
  statCards.push(`<div class="exec-stat"><div class="exec-stat-value">${String(types.size)}</div><div class="exec-stat-label">Categories</div></div>`);

  return `<div class="exec-card">
  <p>${text}</p>
  <div class="exec-stats">${statCards.join('\n')}</div>
</div>`;
}

/** Render table of contents linking to type sections. */
export function renderTableOfContents(grouped: Map<string, Detection[]>): string {
  if (grouped.size <= 1) return '';
  const items = Array.from(grouped.entries())
    .map(([type, dets]) => {
      const label = getTypeLabel(type);
      const crit = dets.filter((d) => d.severity === 'critical').length;
      const badge = crit > 0 ? ` <span class="toc-badge">${String(crit)} critical</span>` : '';
      return `<a class="toc-item" href="#section-${type}">
    <span class="toc-label">${label}</span>
    <span class="toc-meta">${String(dets.length)}${badge}</span>
  </a>`;
    }).join('\n');
  return `<nav class="toc">${items}</nav>`;
}

/** Render the score annotation below the gauge. */
export function renderScoreAnnotation(
  detections: Detection[],
  _stats?: { nodeCount: number; durationMs: number; docTypeCounts?: Record<string, number> },
): string {
  const warnings = detections.filter((d) => d.severity === 'warning').length;
  const criticals = detections.filter((d) => d.severity === 'critical').length;
  const total = warnings + criticals;
  if (total === 0) return '';
  const parts: string[] = [];
  if (criticals > 0) parts.push(`<span class="score-critical">${String(criticals)} critical</span>`);
  if (warnings > 0) parts.push(`<span class="score-warning">${String(warnings)} warning${warnings !== 1 ? 's' : ''}</span>`);
  return `<div class="score-annotation">${String(total)} issue${total !== 1 ? 's' : ''} need attention: ${parts.join(', ')}</div>`;
}

/** Render the risk register table — documents appearing in multiple issues. */
export function renderRiskRegister(detections: Detection[]): string {
  const risks = buildRiskRegister(detections);
  if (risks.length === 0) return '';
  const rows = risks.map((r) => {
    const sevClass = r.severity;
    const typeList = r.types.map((t) => getTypeLabel(t)).join(', ');
    return `<tr>
  <td><span class="file-tag">${escapeHtml(r.label)}</span></td>
  <td>${escapeHtml(typeList)}</td>
  <td style="text-align:center"><span class="risk-score ${sevClass}">${String(r.issueCount)}</span></td>
  <td style="text-align:center"><span class="risk-score ${sevClass}">${r.severity.toUpperCase()}</span></td>
</tr>`;
  }).join('\n');
  return `<table class="risk-table">
  <thead><tr><th>Document</th><th>Issue Types</th><th>Issues</th><th>Risk</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

/** Render the recommended actions section. */
export function renderNextSteps(detections: Detection[]): string {
  if (detections.length === 0) return '';
  const items: Array<{ priority: string; title: string; detail: string }> = [];
  const critical = detections.filter((d) => d.severity === 'critical');
  const stale = detections.filter((d) => d.type === 'staleness');
  const timeBombs = detections.filter((d) => d.type === 'time_bomb');
  const dupes = detections.filter((d) => d.type === 'duplicate');

  if (critical.length > 0) {
    items.push({ priority: 'p1',
      title: `Resolve ${String(critical.length)} critical issue${critical.length !== 1 ? 's' : ''}`,
      detail: 'These represent active conflicts in your documentation that may cause confusion or errors.' });
  }
  if (stale.length > 0) {
    items.push({ priority: items.length === 0 ? 'p1' : 'p2',
      title: `Update ${String(stale.length)} stale document${stale.length !== 1 ? 's' : ''}`,
      detail: 'Outdated content erodes trust in your knowledge base and leads to wrong decisions.' });
  }
  if (timeBombs.length > 0) {
    items.push({ priority: items.length <= 1 ? 'p2' : 'p3',
      title: `Review ${String(timeBombs.length)} time-sensitive item${timeBombs.length !== 1 ? 's' : ''}`,
      detail: 'Approaching deadlines or expirations need owner review.' });
  }
  if (dupes.length > 0) {
    items.push({ priority: 'p3',
      title: `Consolidate ${String(dupes.length)} duplicate${dupes.length !== 1 ? 's' : ''}`,
      detail: 'Multiple versions of the same content cause confusion over which is authoritative.' });
  }
  items.push({ priority: 'p4',
    title: 'Run interactive resolution',
    detail: 'Use <code>ody-refine resolve</code> to fix issues interactively and generate training data.' });

  const html = items.map((item) => `<div class="action-item">
  <div class="action-priority ${item.priority}">${item.priority.toUpperCase()}</div>
  <div>
    <div class="action-title">${escapeHtml(item.title)}</div>
    <div class="action-detail">${item.detail}</div>
  </div>
</div>`).join('\n');
  return `<div class="action-list">${html}</div>`;
}

/** Render a copyable share snippet. */
export function renderShareSnippet(
  score: number,
  counts: Record<string, number>,
): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return '';
  const snippet = `Our docs scored ${String(score)}/100 on Ody Refine. ${String(total)} issue${total !== 1 ? 's' : ''} found. Try it: npx ody-refine ./docs/`;
  return `<div class="exec-card" style="margin-top:1rem">
  <div class="summary-title">Share This Report</div>
  <div style="font-size:0.85rem;color:#475569;padding:0.5rem 0.75rem;background:#F1F5F9;border-radius:6px;cursor:text;user-select:all">${escapeHtml(snippet)}</div>
</div>`;
}

/** Render the "Top 3 Most Urgent" highlight section (legacy compat). */
export function renderTopUrgent(detections: Detection[]): string {
  const urgent = detections
    .filter((d) => d.severity === 'critical' || d.severity === 'warning')
    .slice(0, 3);
  if (urgent.length === 0) return '';
  const items = urgent.map((d, i) => {
    const files = d.nodeIds.map((id) =>
      `<span class="file-tag">${escapeHtml(id.slice(0, 8))}</span>`).join(' ');
    return `<div class="action-item">
  <div class="action-priority ${d.severity === 'critical' ? 'p1' : 'p2'}">${String(i + 1)}</div>
  <div>
    <div class="action-title" style="font-size:0.85rem">${escapeHtml(d.description.slice(0, 100))}</div>
    <div class="finding-files">${files}</div>
  </div>
</div>`;
  }).join('\n');
  return `<div class="action-list">${items}</div>`;
}
