// EXCEEDS_LIMIT: complex HTML template generation with multiple section renderers
/**
 * Generates a self-contained consulting-grade HTML health report.
 * McKinsey-style design: executive summary, scored dimensions,
 * evidence-based findings, contradiction map, risk register, action plan.
 * @module html-report
 */

import type { Detection } from '@useody/platform-core';
import {
  getReportCss,
  renderHeader,
  renderScore,
  renderSummaryCards,
  renderFooter,
  escapeHtml,
} from './html-template.js';
import {
  renderExecutiveSummary,
  renderTableOfContents,
  renderScoreAnnotation,
  renderNextSteps,
  renderRiskRegister,
  renderSectionHeader,
  renderShareSnippet,
  groupByType,
  getTypeLabel,
} from './html-sections.js';
import {
  computeDimensions,
  renderDimensionBars,
  renderContradictionMap,
} from './html-charts.js';

/** Compute health score with diminishing returns on warnings/info. */
function computeScore(detections: Detection[]): number {
  if (detections.length === 0) return 100;
  const criticals = detections.filter((d) => d.severity === 'critical').length;
  const warnings = detections.filter((d) => d.severity === 'warning').length;
  const critPenalty = Math.min(50, criticals * 10);
  const warnPenalty = Math.min(25, Math.min(warnings, 5) * 3 + Math.max(0, warnings - 5));
  return Math.max(0, 100 - critPenalty - warnPenalty);
}

/** Count detections grouped by type. */
function countByType(detections: Detection[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of detections) {
    counts[d.type] = (counts[d.type] ?? 0) + 1;
  }
  return counts;
}

/** Enriched node context attached by the loader. */
interface NodeContext {
  id: string;
  title: string;
  source: string | null;
  excerpt: string;
}

/** Get display label for a node. */
function nodeLabel(n: NodeContext): string {
  if (n.source) return n.source.split('/').pop() ?? n.source;
  return n.id.slice(0, 8);
}

/** Render a source link — clickable if URL. */
function renderSourceLink(source: string | null, label: string): string {
  if (!source) return escapeHtml(label);
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return `<a href="${escapeHtml(source)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  }
  return escapeHtml(label);
}

/** Render a confidence indicator badge. */
function renderConfidence(d: Detection): string {
  if (d.type !== 'contradiction') return '';
  const conf = d.metadata?.['confidence'];
  if (conf === 'high') return ' <span class="confidence-badge confirmed">Confirmed</span>';
  if (conf === 'medium') return ' <span class="confidence-badge likely">Likely</span>';
  if (conf === 'low') return ' <span class="confidence-badge review">Review</span>';
  if (d.description.startsWith('Possible contradiction:')) {
    return ' <span class="confidence-badge likely">Likely</span>';
  }
  return '';
}

/** Extract a short headline from a detection description. */
function extractHeadline(d: Detection): string {
  const meta = d.metadata ?? {};
  const topic = typeof meta['topic'] === 'string' ? meta['topic'] : null;
  if (d.type === 'contradiction' && topic) return `Docs disagree on ${topic}`;
  if (d.type === 'contradiction') {
    const numMatch = d.description.match(/(\d[\d,.]*)\s+vs\s+(\d[\d,.]*)/);
    if (numMatch) return `Number mismatch: ${numMatch[1]} vs ${numMatch[2]}`;
  }
  if (d.type === 'duplicate') return 'Same topic documented differently';
  if (d.type === 'time_bomb') {
    const deadlineMeta = d.metadata?.['deadline'];
    if (typeof deadlineMeta === 'string') {
      return d.description.includes('passed') ? `Expired: ${deadlineMeta}` : `Deadline: ${deadlineMeta}`;
    }
    const m = d.description.match(/["'](\d{4}-\d{2}(?:-\d{2})?|Q[1-4]\s*\d{4})['"]/);
    if (m) return d.description.includes('passed') ? `Expired deadline: ${m[1]}` : `Upcoming deadline: ${m[1]}`;
    return 'Date-dependent content';
  }
  if (d.type === 'staleness') {
    const titleMatch = d.description.match(/^"([^"]+)"/);
    if (titleMatch) return `May be outdated: ${titleMatch[1]!.slice(0, 40)}`;
    return 'Potentially outdated content';
  }
  const desc = d.description;
  const colonIdx = desc.indexOf(':');
  if (colonIdx > 0 && colonIdx < 60) return desc.slice(0, colonIdx);
  return desc.length > 80 ? desc.slice(0, 77) + '...' : desc;
}

/** Extract two opposing claims from metadata or description. */
function extractClaims(d: Detection): [string, string] | null {
  const meta = d.metadata ?? {};
  if (typeof meta['claimA'] === 'string' && typeof meta['claimB'] === 'string') {
    return [meta['claimA'], meta['claimB']];
  }
  const vsMatch = d.description.match(/"([^"]+)"\s+vs\s+"([^"]+)"/);
  if (vsMatch) return [vsMatch[1]!, vsMatch[2]!];
  const saysMatch = d.description.match(
    /"([^"]+)"\s+says:\s*(.*?)\s*—\s*(?:but|while)\s+"([^"]+)"\s+says:\s*(.*)/,
  );
  if (saysMatch) return [saysMatch[2]!, saysMatch[4]!];
  const statesMatch = d.description.match(/states:\s*'([^']+)'.*states:\s*'([^']+)'/);
  if (statesMatch) return [statesMatch[1]!, statesMatch[2]!];
  return null;
}

/** Render a single detection as a professional finding card. */
/** Effort badge labels and colors. */
const EFFORT_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  quick_win: { label: 'Quick Win', color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
  medium: { label: 'Medium Effort', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  major: { label: 'Major Project', color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
};

/** Render effort badge if present in metadata. */
function renderEffortBadge(d: Detection): string {
  const effort = d.metadata?.['effort'];
  if (typeof effort !== 'string') return '';
  const display = EFFORT_DISPLAY[effort];
  if (!display) return '';
  return ` <span class="effort-badge" style="color:${display.color};background:${display.bg}">${display.label}</span>`;
}

/** Render a single detection as a professional finding card. */
function renderDetection(d: Detection): string {
  const headline = extractHeadline(d);
  const claims = extractClaims(d);
  const nodes = d.metadata?.['nodes'];
  const nodeArr = Array.isArray(nodes) ? nodes as NodeContext[] : [];
  const indicator = renderConfidence(d);
  const effortBadge = renderEffortBadge(d);
  const impact = d.metadata?.['impact'];
  const docType = typeof d.metadata?.['docType'] === 'string' ? d.metadata['docType'] : null;
  const docTypeBadge = docType ? ` <span class="doc-type-tag">${escapeHtml(docType)}</span>` : '';

  const filePaths = nodeArr.length > 0
    ? nodeArr.map((n) => `<span class="file-tag" title="${escapeHtml(n.source ?? n.id)}">${escapeHtml(nodeLabel(n))}</span>`).join(' ')
    : d.nodeIds.map((id) => `<span class="file-tag">${escapeHtml(id.slice(0, 8))}</span>`).join(' ');

  let claimsHtml = '';
  if (claims) {
    const labelA = nodeArr[0] ? renderSourceLink(nodeArr[0].source, nodeLabel(nodeArr[0])) : '';
    const labelB = nodeArr[1] ? renderSourceLink(nodeArr[1].source, nodeLabel(nodeArr[1])) : '';
    claimsHtml = `<div class="evidence-grid">
  <div class="evidence-block evidence-block-a"><span class="evidence-source">${labelA}</span><div class="evidence-text">&ldquo;${escapeHtml(claims[0])}&rdquo;</div></div>
  <div class="evidence-vs">VS</div>
  <div class="evidence-block evidence-block-b"><span class="evidence-source">${labelB}</span><div class="evidence-text">&ldquo;${escapeHtml(claims[1])}&rdquo;</div></div>
</div>`;
  }

  const impactHtml = typeof impact === 'string' && impact.length > 0
    ? `<div class="finding-impact">${escapeHtml(impact)}</div>` : '';
  const actionHtml = d.suggestedAction
    ? `<div class="finding-action"><strong>Recommendation:</strong> ${escapeHtml(d.suggestedAction)}</div>` : '';

  return `<div class="finding ${d.severity}">
  <div class="finding-header">
    <span class="sev-badge ${d.severity}">${d.severity}</span>${indicator}
    <span class="finding-headline">${escapeHtml(headline)}</span>${effortBadge}
  </div>
  <div class="finding-files">${filePaths}${docTypeBadge}</div>
  ${claimsHtml}${impactHtml}${actionHtml}
</div>`;
}

/** Render grouped detections with section headers. Collapses excess info items. */
function renderGroupedDetections(grouped: Map<string, Detection[]>): string {
  return Array.from(grouped.entries())
    .map(([type, dets]) => {
      const label = getTypeLabel(type);
      const nonInfo = dets.filter((d) => d.severity !== 'info');
      const info = dets.filter((d) => d.severity === 'info');
      const nonInfoCards = nonInfo.map(renderDetection).join('\n');
      let infoHtml = '';
      if (info.length > 5) {
        const visible = info.slice(0, 3).map(renderDetection).join('\n');
        const hidden = info.slice(3).map(renderDetection).join('\n');
        infoHtml = `${visible}\n<details><summary class="info-toggle">Show ${String(info.length - 3)} more informational items</summary>\n${hidden}\n</details>`;
      } else {
        infoHtml = info.map(renderDetection).join('\n');
      }
      return `<div class="type-section" id="section-${type}">
  <h2 class="type-header">${label}<span class="type-count">${String(dets.length)}</span></h2>
  <div class="findings">\n${nonInfoCards}\n${infoHtml}\n</div>
</div>`;
    })
    .join('\n');
}

/** Render empty state block. */
function renderEmpty(): string {
  return `<div class="empty-state">
  <div style="font-size:2.5rem;margin-bottom:0.5rem">&#10003;</div>
  <h2>No issues found</h2>
  <p>Your knowledge base looks healthy. Run again after your next doc update.</p>
</div>`;
}

/** Render stats line. */
function renderStats(stats?: { nodeCount: number; durationMs: number }): string {
  if (!stats) return '';
  const seconds = (stats.durationMs / 1000).toFixed(1);
  return `<div class="stats-line">${String(stats.nodeCount)} nodes &middot; ${seconds}s</div>`;
}

/**
 * Generate a self-contained consulting-grade HTML health report.
 * Produces valid HTML with <!DOCTYPE html>. No external links.
 */
export function generateHtmlReport(
  detections: Detection[],
  stats?: { nodeCount: number; durationMs: number; docTypeCounts?: Record<string, number> },
): string {
  const score = computeScore(detections);
  const counts = countByType(detections);
  const timestamp = new Date().toISOString();
  const grouped = groupByType(detections);
  const dims = computeDimensions(detections);
  const contradictionMap = renderContradictionMap(detections);
  const riskRegister = renderRiskRegister(detections);

  const body = detections.length === 0
    ? `<div class="report-body">${renderEmpty()}</div>`
    : `<div class="report-body">
  <section class="report-section">
    ${renderSectionHeader('01', 'Executive Summary')}
    ${renderExecutiveSummary(detections, stats)}
  </section>
  <section class="report-section">
    ${renderSectionHeader('02', 'Issues by Category')}
    ${renderSummaryCards(counts)}
    ${renderTableOfContents(grouped)}
  </section>
  <section class="report-section">
    ${renderSectionHeader('03', 'Detailed Findings')}
    ${renderGroupedDetections(grouped)}
  </section>
  ${contradictionMap ? `<section class="report-section">
    ${renderSectionHeader('04', 'Contradiction Map')}
    ${contradictionMap}
  </section>` : ''}
  ${riskRegister ? `<section class="report-section">
    ${renderSectionHeader(contradictionMap ? '05' : '04', 'Risk Register')}
    ${riskRegister}
  </section>` : ''}
  <section class="report-section">
    ${renderSectionHeader(contradictionMap && riskRegister ? '06' : contradictionMap || riskRegister ? '05' : '04', 'Recommended Actions')}
    ${renderNextSteps(detections)}
    ${renderShareSnippet(score, counts)}
  </section>
</div>`;

  const issueCount = detections.length;
  const ogDesc = `Score: ${String(score)}/100 — ${String(issueCount)} issue${issueCount !== 1 ? 's' : ''} found.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="Knowledge Health Report — Ody Refine">
  <meta property="og:description" content="${escapeHtml(ogDesc)}">
  <meta name="twitter:card" content="summary">
  <title>Knowledge Health Report &mdash; Ody Refine</title>
  <style>${getReportCss()}</style>
</head>
<body>
${renderHeader(stats)}
<div class="score-hero">
${renderScore(score)}
${renderScoreAnnotation(detections, stats)}
${renderDimensionBars(dims)}
</div>
${renderStats(stats)}
${body}
${renderFooter(timestamp)}
</body>
</html>`;
}
