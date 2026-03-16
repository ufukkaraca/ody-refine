/**
 * Report section renderers: executive summary, grouping, and action items.
 * These give the report a consultant-audit feel.
 * @module html-sections
 */

import type { Detection } from '@useody/platform-core';
import { escapeHtml, renderMarkdownInline } from './html-template.js';

/** Human-readable labels for detection types. */
const TYPE_LABELS: Record<string, string> = {
  contradiction: 'Contradictions',
  duplicate: 'Duplicates',
  staleness: 'Stale Content',
  undocumented: 'Undocumented Areas',
  time_bomb: 'Time Bombs',
};

/** Severity priority for sorting type groups. */
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

/** Render the executive summary section. */
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
  if (critical > 0) {
    parts.push(`<strong>${String(critical)} critical</strong> requiring immediate attention`);
  }
  if (warnings > 0) parts.push(`${String(warnings)} warning${warnings !== 1 ? 's' : ''}`);
  if (parts.length > 0) text += ` This includes ${parts.join(' and ')}.`;

  let compositionText = '';
  if (stats?.docTypeCounts && nodeCount !== null) {
    const entries = Object.entries(stats.docTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => `${String(count)} ${type}`)
      .join(', ');
    if (entries) compositionText = ` Corpus: ${String(nodeCount)} documents — ${entries}.`;
  }

  const compositionHtml = compositionText
    ? `\n  <p class="corpus-composition">${escapeHtml(compositionText.trim())}</p>`
    : '';

  return `<div class="exec-summary">
  <div class="section-label">Executive Summary</div>
  <p>${text}</p>${compositionHtml}
</div>`;
}

/** Render table of contents linking to type sections. */
export function renderTableOfContents(
  grouped: Map<string, Detection[]>,
): string {
  if (grouped.size <= 1) return '';
  const items = Array.from(grouped.entries())
    .map(([type, dets]) => {
      const label = getTypeLabel(type);
      const crit = dets.filter((d) => d.severity === 'critical').length;
      const badge = crit > 0
        ? ` <span class="toc-badge">${String(crit)} critical</span>`
        : '';
      return `<a class="toc-item" href="#section-${type}">
    <span class="toc-label">${label}</span>
    <span class="toc-meta">${String(dets.length)}${badge}</span>
  </a>`;
    })
    .join('\n');
  return `<nav class="toc">
  <div class="section-label">Contents</div>
  ${items}
</nav>`;
}

/** Render the "Top 3 Most Urgent" highlight section. */
export function renderTopUrgent(detections: Detection[]): string {
  const urgent = detections
    .filter((d) => d.severity === 'critical' || d.severity === 'warning')
    .slice(0, 3);
  if (urgent.length === 0) return '';
  const items = urgent
    .map((d, i) => {
      const enrichedNodes = d.metadata?.['nodes'];
      const files = Array.isArray(enrichedNodes) && enrichedNodes.length > 0
        ? (enrichedNodes as Array<{ id: string; source: string | null }>)
            .map((n) => {
              const label = n.source ? (n.source.split('/').pop() ?? n.source) : n.id.slice(0, 8);
              return `<span class="file-path" title="${escapeHtml(n.source ?? n.id)}">${escapeHtml(label)}</span>`;
            })
            .join(' ')
        : d.nodeIds
            .map((id) => `<span class="file-path">${escapeHtml(id.slice(0, 8))}</span>`)
            .join(' ');
      return `<div class="urgent-item ${d.severity}">
    <span class="urgent-num">${String(i + 1)}</span>
    <div class="urgent-body">
      <div class="urgent-desc">${renderMarkdownInline(d.description)}</div>
      <div class="urgent-files">${files}</div>
    </div>
  </div>`;
    })
    .join('\n');
  return `<div class="top-urgent">
  <div class="section-label">Most Urgent</div>
${items}
</div>`;
}

/** Render a copyable share snippet for Slack/email forwarding. */
export function renderShareSnippet(
  score: number,
  counts: Record<string, number>,
): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return '';
  const contradictions = counts['contradiction'] ?? 0;
  const detail = contradictions > 0
    ? `${String(contradictions)} contradiction${contradictions !== 1 ? 's' : ''} found.`
    : `${String(total)} issue${total !== 1 ? 's' : ''} found.`;
  const snippet = `Our docs scored ${String(score)}/100 on Ody Refine. ${detail} Try it: npx ody-refine ./docs/`;
  return `<div class="share-snippet">
  <div class="section-label">Share This Report</div>
  <div class="share-text">${escapeHtml(snippet)}</div>
</div>`;
}

/** Render the issue count annotation below the score ring. */
export function renderScoreAnnotation(
  detections: Detection[],
  stats?: { nodeCount: number; durationMs: number; docTypeCounts?: Record<string, number> },
): string {
  const warnings = detections.filter((d) => d.severity === 'warning').length;
  const criticals = detections.filter((d) => d.severity === 'critical').length;
  const total = warnings + criticals;
  if (total === 0) return '';
  const parts: string[] = [];
  if (criticals > 0) parts.push(`<span class="score-critical">${String(criticals)} critical</span>`);
  if (warnings > 0) parts.push(`<span class="score-warning">${String(warnings)} warning${warnings !== 1 ? 's' : ''}</span>`);
  let compositionNote = '';
  if (stats?.docTypeCounts && stats.nodeCount) {
    const entries = Object.entries(stats.docTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([type, count]) => `${String(count)} ${type}`)
      .join(', ');
    if (entries) compositionNote = ` &mdash; ${String(stats.nodeCount)} docs: ${escapeHtml(entries)}`;
  }
  return `<div class="score-annotation">${String(total)} issue${total !== 1 ? 's' : ''} need attention: ${parts.join(', ')}${compositionNote}</div>`;
}

/** Render the "What To Do Next" section. */
export function renderNextSteps(detections: Detection[]): string {
  if (detections.length === 0) return '';
  const steps: string[] = [];
  const critical = detections.filter((d) => d.severity === 'critical');
  const stale = detections.filter((d) => d.type === 'staleness');
  const timeBombs = detections.filter((d) => d.type === 'time_bomb');
  const dupes = detections.filter((d) => d.type === 'duplicate');

  if (critical.length > 0) {
    steps.push(`Resolve the <strong>${String(critical.length)} critical issue${critical.length !== 1 ? 's' : ''}</strong> first &mdash; these represent active conflicts in your documentation.`);
  }
  if (stale.length > 0) {
    steps.push(`Update ${String(stale.length)} stale document${stale.length !== 1 ? 's' : ''} &mdash; outdated content erodes trust in your knowledge base.`);
  }
  if (timeBombs.length > 0) {
    steps.push(`Check ${String(timeBombs.length)} time-sensitive item${timeBombs.length !== 1 ? 's' : ''} for approaching deadlines or expirations.`);
  }
  if (dupes.length > 0) {
    steps.push(`Consolidate ${String(dupes.length)} duplicate${dupes.length !== 1 ? 's' : ''} &mdash; multiple versions of the same content cause confusion.`);
  }
  steps.push('Run <code>ody-refine resolve</code> to fix issues interactively.');

  const html = steps
    .map((s, i) => `<div class="step"><span class="step-num">${String(i + 1)}</span><span>${s}</span></div>`)
    .join('\n');
  return `<div class="next-steps">
  <div class="section-label">What To Do Next</div>
${html}
</div>`;
}
