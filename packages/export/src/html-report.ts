/**
 * Generates a self-contained HTML health report from detections.
 * Structured like a consultant's audit: executive summary, grouped findings,
 * actionable next steps.
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
  renderMarkdownInline,
} from './html-template.js';
import {
  renderExecutiveSummary,
  renderTableOfContents,
  renderTopUrgent,
  renderNextSteps,
  groupByType,
  getTypeLabel,
} from './html-sections.js';

/** Compute a simple health score from detections. */
function computeScore(detections: Detection[]): number {
  if (detections.length === 0) return 100;
  const penalty = detections.reduce((sum, d) => {
    if (d.severity === 'critical') return sum + 15;
    if (d.severity === 'warning') return sum + 5;
    return sum + 1;
  }, 0);
  return Math.max(0, 100 - penalty);
}

/** Count detections grouped by type. */
function countByType(detections: Detection[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of detections) {
    counts[d.type] = (counts[d.type] ?? 0) + 1;
  }
  return counts;
}

/** Enriched node context attached by the loader after detection. */
interface NodeContext {
  id: string;
  title: string;
  source: string | null;
  excerpt: string;
}

/** Get the display label for a node context (filename or abbreviated id). */
function nodeLabel(n: NodeContext): string {
  if (n.source) return n.source.split('/').pop() ?? n.source;
  return n.id.slice(0, 8);
}

/** Render node IDs as prominent file path badges, using enriched context when available. */
function renderNodeIds(nodeIds: string[], metadata?: Record<string, unknown>): string {
  if (nodeIds.length === 0) return '';
  const nodes = metadata?.['nodes'];
  if (Array.isArray(nodes) && nodes.length > 0) {
    const badges = (nodes as NodeContext[])
      .map((n) => {
        const label = nodeLabel(n);
        const title = escapeHtml(n.source ?? n.id);
        return `<span class="file-path" title="${title}">${escapeHtml(label)}</span>`;
      })
      .join('');
    return `<div class="nodes">${badges}</div>`;
  }
  const badges = nodeIds
    .map((id) => `<span class="file-path">${escapeHtml(id.slice(0, 8))}</span>`)
    .join('');
  return `<div class="nodes">${badges}</div>`;
}

/** Extract and render a content quote from metadata if available. */
function renderQuote(metadata?: Record<string, unknown>): string {
  if (!metadata) return '';
  const raw = metadata['quote'] ?? metadata['raw'] ?? metadata['content'];
  if (typeof raw !== 'string' || raw.length === 0) return '';
  const truncated = raw.length > 200 ? raw.slice(0, 200) + '...' : raw;
  return `<div class="quote">${escapeHtml(truncated)}</div>`;
}

/** Render side-by-side source quotes for contradiction detections. */
function renderContext(d: Detection): string {
  if (d.type !== 'contradiction') return '';
  const nodes = d.metadata?.['nodes'];
  if (!Array.isArray(nodes) || nodes.length < 2) return '';
  const [a, b] = nodes as [NodeContext, NodeContext];
  return `<div class="context-quotes">
  <div class="source-quote">
    <span class="source-quote-label">📄 ${escapeHtml(nodeLabel(a))}</span>
    <span class="source-quote-title">${escapeHtml(a.title)}</span>
    <div class="source-quote-text">${escapeHtml(a.excerpt)}</div>
  </div>
  <div class="source-quote-vs">vs</div>
  <div class="source-quote">
    <span class="source-quote-label">📄 ${escapeHtml(nodeLabel(b))}</span>
    <span class="source-quote-title">${escapeHtml(b.title)}</span>
    <div class="source-quote-text">${escapeHtml(b.excerpt)}</div>
  </div>
</div>`;
}

/** Render a confidence indicator using validated confidence or heuristic fallback. */
function renderConfidenceIndicator(d: Detection): string {
  if (d.type !== 'contradiction') return '';
  const meta = d.metadata ?? {};

  // Use LLM-validated confidence when available
  const llmConf = meta['confidence'];
  if (llmConf === 'high') {
    return ` <span class="confidence-indicator confirmed">&#10069; Confirmed conflict</span>`;
  }
  if (llmConf === 'medium') {
    return ` <span class="confidence-indicator likely">&#9888; Likely mismatch</span>`;
  }
  if (llmConf === 'low') {
    return ` <span class="confidence-indicator review">&#128269; Review needed</span>`;
  }

  // Heuristic fallback
  const edgeConf = meta['edgeConfidence'];
  if (typeof edgeConf === 'number' && edgeConf >= 0.8) {
    return ` <span class="confidence-indicator confirmed">&#10069; Confirmed conflict</span>`;
  }
  if (d.description.startsWith('Possible contradiction:')) {
    return ` <span class="confidence-indicator likely">&#9888; Likely mismatch</span>`;
  }
  return ` <span class="confidence-indicator review">&#128269; Review needed</span>`;
}

/** Render LLM-provided impact and explanation from validation metadata. */
function renderValidationInsights(metadata?: Record<string, unknown>): string {
  if (!metadata) return '';
  const impact = metadata['impact'];
  const explanation = metadata['explanation'];
  const parts: string[] = [];
  if (typeof impact === 'string' && impact.length > 0) {
    parts.push(
      `<div class="impact"><span class="impact-label">Impact:</span> ${renderMarkdownInline(impact)}</div>`,
    );
  }
  if (typeof explanation === 'string' && explanation.length > 0) {
    parts.push(
      `<div class="explanation"><em>${renderMarkdownInline(explanation)}</em></div>`,
    );
  }
  return parts.join('');
}

/** Render a single detection as an HTML card. */
function renderDetection(d: Detection): string {
  const action = d.suggestedAction
    ? `<div class="action"><span class="action-label">Suggestion:</span> ${escapeHtml(d.suggestedAction)}</div>`
    : '';
  const nodes = renderNodeIds(d.nodeIds, d.metadata);
  const quote = renderQuote(d.metadata);
  const context = renderContext(d);
  const indicator = renderConfidenceIndicator(d);
  const insights = renderValidationInsights(d.metadata);
  return `<div class="detection ${d.severity}">
  <div class="detection-header">
    <span class="severity ${d.severity}">${d.severity}</span>
    <span class="type">${escapeHtml(d.type)}</span>${indicator}
  </div>
  <div class="desc">${renderMarkdownInline(d.description)}</div>
  ${insights}${nodes}${context}${quote}${action}
</div>`;
}

/** Render all detection groups with section headers. */
function renderGroupedDetections(grouped: Map<string, Detection[]>): string {
  return Array.from(grouped.entries())
    .map(([type, dets]) => {
      const label = getTypeLabel(type);
      const cards = dets.map(renderDetection).join('\n');
      return `<div class="type-section" id="section-${type}">
  <h2 class="type-header">${label}<span class="type-count">${String(dets.length)}</span></h2>
  <div class="detections">\n${cards}\n</div>
</div>`;
    })
    .join('\n');
}

/** Render the empty-state block. */
function renderEmpty(): string {
  return `<div class="empty">
  <div style="font-size:2.5rem;margin-bottom:0.5rem">&#10003;</div>
  <h2>No issues found</h2>
  <p>Your knowledge base looks healthy.</p>
</div>`;
}

/** Render optional stats line. */
function renderStats(stats?: {
  nodeCount: number;
  durationMs: number;
}): string {
  if (!stats) return '';
  const seconds = (stats.durationMs / 1000).toFixed(1);
  return `<div class="stats">${String(stats.nodeCount)} nodes analyzed in ${seconds}s</div>`;
}

/**
 * Generate a self-contained HTML health report from detections.
 * Produces valid HTML with <!DOCTYPE html>. No external links.
 */
export function generateHtmlReport(
  detections: Detection[],
  stats?: { nodeCount: number; durationMs: number },
): string {
  const score = computeScore(detections);
  const counts = countByType(detections);
  const timestamp = new Date().toISOString();
  const grouped = groupByType(detections);

  const body = detections.length === 0
    ? renderEmpty()
    : [
        renderExecutiveSummary(detections, stats),
        renderSummaryCards(counts),
        renderTableOfContents(grouped),
        renderTopUrgent(detections),
        renderGroupedDetections(grouped),
        renderNextSteps(detections),
      ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ody Refine Health Report</title>
  <style>${getReportCss()}</style>
</head>
<body>
${renderHeader()}
${renderScore(score)}
${renderStats(stats)}
${body}
${renderFooter(timestamp)}
</body>
</html>`;
}
