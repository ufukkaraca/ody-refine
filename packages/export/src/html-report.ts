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
} from './html-template.js';
import {
  renderExecutiveSummary,
  renderTableOfContents,
  renderTopUrgent,
  renderNextSteps,
  renderShareSnippet,
  renderScoreAnnotation,
  groupByType,
  getTypeLabel,
} from './html-sections.js';

/** Compute health score. Diminishing returns on warnings/info. */
function computeScore(detections: Detection[]): number {
  if (detections.length === 0) return 100;
  const criticals = detections.filter((d) => d.severity === 'critical').length;
  const warnings = detections.filter((d) => d.severity === 'warning').length;
  // Criticals: 10 points each (max 50)
  // Warnings: diminishing — first 5 at 3pts, rest at 1pt (max 25)
  // Info: ignored in score (they're informational, not actionable)
  const critPenalty = Math.min(50, criticals * 10);
  const warnPenalty = Math.min(25, Math.min(warnings, 5) * 3 + Math.max(0, warnings - 5));
  const penalty = critPenalty + warnPenalty;
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

/** Get the display label for a node context. */
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

/** Render a confidence indicator. */
function renderConfidenceIndicator(d: Detection): string {
  if (d.type !== 'contradiction') return '';
  const meta = d.metadata ?? {};
  const llmConf = meta['confidence'];
  if (llmConf === 'high') return ' <span class="confidence-indicator confirmed">Confirmed</span>';
  if (llmConf === 'medium') return ' <span class="confidence-indicator likely">Likely</span>';
  if (llmConf === 'low') return ' <span class="confidence-indicator review">Review</span>';
  if (d.description.startsWith('Possible contradiction:')) {
    return ' <span class="confidence-indicator likely">Likely</span>';
  }
  return '';
}

/** Extract a short headline from a detection description. */
function extractHeadline(d: Detection): string {
  const meta = d.metadata ?? {};
  const topic = typeof meta['topic'] === 'string' ? meta['topic'] : null;
  if (d.type === 'contradiction' && topic) return `Docs disagree on ${topic}`;
  if (d.type === 'contradiction') {
    // For number contradictions: "500 vs 1000 rate limits"
    const numMatch = d.description.match(/(\d[\d,.]*)\s+vs\s+(\d[\d,.]*)/);
    if (numMatch) return `Number mismatch: ${numMatch[1]} vs ${numMatch[2]}`;
  }
  if (d.type === 'duplicate') return 'Same topic documented differently';
  if (d.type === 'time_bomb') {
    const m = d.description.match(/["'](\d{4}-\d{2}(?:-\d{2})?|Q[1-4]\s*\d{4})['"]/);
    if (m) {
      const expired = d.description.includes('passed');
      return expired ? `Expired deadline: ${m[1]}` : `Upcoming deadline: ${m[1]}`;
    }
    const deadlineMeta = d.metadata?.['deadline'];
    if (typeof deadlineMeta === 'string') {
      return d.description.includes('passed')
        ? `Expired: ${deadlineMeta}`
        : `Deadline: ${deadlineMeta}`;
    }
    return 'Date-dependent content';
  }
  if (d.type === 'staleness') {
    // Extract the quoted title from description: "X" may be outdated
    const titleMatch = d.description.match(/^"([^"]+)"/);
    if (titleMatch) return `May be outdated: ${titleMatch[1]!.slice(0, 40)}`;
    return 'Potentially outdated content';
  }
  const desc = d.description;
  const colonIdx = desc.indexOf(':');
  if (colonIdx > 0 && colonIdx < 60) return desc.slice(0, colonIdx);
  const dashIdx = desc.indexOf(' — ');
  if (dashIdx > 0 && dashIdx < 80) return desc.slice(0, dashIdx);
  return desc.length > 80 ? desc.slice(0, 77) + '...' : desc;
}

/** Extract the two claims from metadata or description. */
function extractClaims(d: Detection): [string, string] | null {
  const meta = d.metadata ?? {};
  const clA = meta['claimA'];
  const clB = meta['claimB'];
  if (typeof clA === 'string' && typeof clB === 'string') return [clA, clB];
  const vsMatch = d.description.match(/"([^"]+)"\s+vs\s+"([^"]+)"/);
  if (vsMatch) return [vsMatch[1]!, vsMatch[2]!];
  // Parse: "X" says: ... — but "Y" says: ...
  const saysMatch = d.description.match(
    /"([^"]+)"\s+says:\s*(.*?)\s*—\s*(?:but|while)\s+"([^"]+)"\s+says:\s*(.*)/,
  );
  if (saysMatch) return [saysMatch[2]!, saysMatch[4]!];
  // Parse: X states: 'claim'. However, Y states: 'claim'.
  const statesMatch = d.description.match(
    /states:\s*'([^']+)'.*states:\s*'([^']+)'/,
  );
  if (statesMatch) return [statesMatch[1]!, statesMatch[2]!];
  return null;
}

/** Render a single detection as a scannable card. */
function renderDetection(d: Detection): string {
  const headline = extractHeadline(d);
  const claims = extractClaims(d);
  const nodes = d.metadata?.['nodes'];
  const nodeArr = Array.isArray(nodes) ? nodes as NodeContext[] : [];
  const indicator = renderConfidenceIndicator(d);
  const impact = d.metadata?.['impact'];

  const docType = typeof d.metadata?.['docType'] === 'string' ? d.metadata['docType'] : null;
  const docTypeBadge = docType ? ` <span class="doc-type-badge">${escapeHtml(docType)}</span>` : '';
  const filePaths = nodeArr.length > 0
    ? nodeArr.map((n) => `<span class="file-path" title="${escapeHtml(n.source ?? n.id)}">${escapeHtml(nodeLabel(n))}</span>`).join(' ')
    : d.nodeIds.map((id) => `<span class="file-path">${escapeHtml(id.slice(0, 8))}</span>`).join(' ');
  const files = filePaths + docTypeBadge;

  let claimsHtml = '';
  if (claims) {
    const labelA = nodeArr[0] ? renderSourceLink(nodeArr[0].source, nodeLabel(nodeArr[0])) : '';
    const labelB = nodeArr[1] ? renderSourceLink(nodeArr[1].source, nodeLabel(nodeArr[1])) : '';
    claimsHtml = `<div class="claims-grid">
  <div class="claim claim-a"><div class="claim-source">${labelA}</div><div class="claim-text">"${escapeHtml(claims[0])}"</div></div>
  <div class="claim-vs">vs</div>
  <div class="claim claim-b"><div class="claim-source">${labelB}</div><div class="claim-text">"${escapeHtml(claims[1])}"</div></div>
</div>`;
  }

  const impactHtml = typeof impact === 'string' && impact.length > 0
    ? `<div class="impact">${escapeHtml(impact)}</div>` : '';

  const actionHtml = d.suggestedAction
    ? `<div class="action">${escapeHtml(d.suggestedAction)}</div>` : '';

  return `<div class="detection ${d.severity}">
  <div class="detection-header">
    <span class="severity ${d.severity}">${d.severity}</span>${indicator}
    <span class="headline">${escapeHtml(headline)}</span>
  </div>
  <div class="detection-files">${files}</div>
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
  <div class="detections">\n${nonInfoCards}\n${infoHtml}\n</div>
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
function renderStats(stats?: { nodeCount: number; durationMs: number; docTypeCounts?: Record<string, number> }): string {
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
  stats?: { nodeCount: number; durationMs: number; docTypeCounts?: Record<string, number> },
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
${renderScoreAnnotation(detections, stats)}
${renderShareSnippet(score, counts)}
${renderStats(stats)}
${body}
${renderFooter(timestamp)}
</body>
</html>`;
}
