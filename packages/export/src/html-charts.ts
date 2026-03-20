/**
 * SVG chart generators for the Ody Refine consulting report.
 * Pure functions — no external dependencies.
 * @module html-charts
 */

import type { Detection } from '@useody/platform-core';
import { escapeHtml } from './html-template.js';

/** A dimension score for the health breakdown. */
export interface DimensionScore {
  label: string;
  score: number;
  color: string;
}

/** Compute dimension scores from detections. */
export function computeDimensions(detections: Detection[]): DimensionScore[] {
  const contras = detections.filter((d) => d.type === 'contradiction').length;
  const dupes = detections.filter((d) => d.type === 'duplicate').length;
  const stale = detections.filter((d) => d.type === 'staleness').length;
  const timeBombs = detections.filter((d) => d.type === 'time_bomb').length;
  const undoc = detections.filter((d) => d.type === 'undocumented').length;

  const consistency = Math.max(0, 100 - contras * 15 - dupes * 8);
  const freshness = Math.max(0, 100 - stale * 12 - timeBombs * 10);
  const coverage = Math.max(0, 100 - undoc * 10);

  const colorForScore = (s: number): string =>
    s >= 70 ? '#10B981' : s >= 40 ? '#F59E0B' : '#EF4444';

  return [
    { label: 'Consistency', score: consistency, color: colorForScore(consistency) },
    { label: 'Freshness', score: freshness, color: colorForScore(freshness) },
    { label: 'Coverage', score: coverage, color: colorForScore(coverage) },
  ];
}

/** Render the main health score as a thick SVG arc gauge. */
export function renderScoreGauge(score: number): string {
  const r = 58;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
  const trackColor = '#E2E8F0';
  return `<svg width="160" height="160" viewBox="0 0 160 160">
  <circle cx="80" cy="80" r="${String(r)}" stroke="${trackColor}" stroke-width="12" fill="none"/>
  <circle cx="80" cy="80" r="${String(r)}" stroke="${color}" stroke-width="12" fill="none"
    stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
    transform="rotate(-90 80 80)" stroke-linecap="round"/>
  <text x="80" y="74" text-anchor="middle" font-size="42" font-weight="800"
    fill="#0F172A" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${String(score)}</text>
  <text x="80" y="98" text-anchor="middle" font-size="11" font-weight="600"
    fill="#94A3B8" letter-spacing="0.12em"
    font-family="-apple-system,BlinkMacSystemFont,sans-serif">OUT OF 100</text>
</svg>`;
}

/** Render dimension score bars as HTML (not SVG). */
export function renderDimensionBars(dims: DimensionScore[]): string {
  if (dims.length === 0) return '';
  const cards = dims.map((d) => {
    const fillClass = d.score >= 70 ? 'dim-fill-good' : d.score >= 40 ? 'dim-fill-warn' : 'dim-fill-bad';
    return `<div class="dim-card">
  <div class="dim-header">
    <span class="dim-label">${escapeHtml(d.label)}</span>
    <span class="dim-value">${String(d.score)}</span>
  </div>
  <div class="dim-bar-track"><div class="dim-bar-fill ${fillClass}" style="width:${String(d.score)}%"></div></div>
</div>`;
  }).join('\n');
  return `<div class="dim-grid">${cards}</div>`;
}

/** Node info for the contradiction map. */
interface MapNode {
  id: string;
  label: string;
  count: number;
}

/** Build a contradiction network SVG showing doc-to-doc conflicts. */
export function renderContradictionMap(detections: Detection[]): string {
  const contradictions = detections.filter((d) => d.type === 'contradiction');
  if (contradictions.length === 0) return '';

  // Collect unique nodes and edges
  const nodeMap = new Map<string, MapNode>();
  const edges: Array<{ a: string; b: string; severity: string }> = [];

  for (const d of contradictions) {
    const enriched = d.metadata?.['nodes'];
    const nodeArr = Array.isArray(enriched)
      ? (enriched as Array<{ id: string; title: string; source: string | null }>)
      : [];
    const ids = nodeArr.length >= 2
      ? [nodeArr[0]!.id, nodeArr[1]!.id]
      : d.nodeIds.slice(0, 2);
    const labels = nodeArr.length >= 2
      ? [nodeArr[0]!.source?.split('/').pop() ?? nodeArr[0]!.title.slice(0, 20),
         nodeArr[1]!.source?.split('/').pop() ?? nodeArr[1]!.title.slice(0, 20)]
      : ids.map((id) => id.slice(0, 8));

    for (let i = 0; i < ids.length; i++) {
      const nid = ids[i]!;
      const existing = nodeMap.get(nid);
      if (existing) { existing.count++; }
      else { nodeMap.set(nid, { id: nid, label: labels[i]!, count: 1 }); }
    }
    if (ids.length >= 2) {
      edges.push({ a: ids[0]!, b: ids[1]!, severity: d.severity });
    }
  }

  const nodes = Array.from(nodeMap.values());
  if (nodes.length < 2) return '';

  // Circular layout
  const w = 500;
  const h = 320;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(cx, cy) - 60;
  const positions = new Map<string, { x: number; y: number }>();

  for (let i = 0; i < nodes.length; i++) {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    positions.set(nodes[i]!.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  const edgeLines = edges.map((e) => {
    const pa = positions.get(e.a);
    const pb = positions.get(e.b);
    if (!pa || !pb) return '';
    const color = e.severity === 'critical' ? '#EF4444' : '#F59E0B';
    const width = e.severity === 'critical' ? '2.5' : '1.5';
    return `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}" stroke="${color}" stroke-width="${width}" opacity="0.6"/>`;
  }).join('\n');

  const nodeCircles = nodes.map((n) => {
    const p = positions.get(n.id)!;
    const r = 18 + Math.min(n.count * 4, 12);
    const truncLabel = n.label.length > 14 ? n.label.slice(0, 12) + '..' : n.label;
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${String(r)}" fill="#1A3358" opacity="0.9"/>
<text x="${p.x.toFixed(1)}" y="${(p.y + 3).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="600" fill="#fff" font-family="-apple-system,sans-serif">${escapeHtml(truncLabel)}</text>`;
  }).join('\n');

  const svg = `<svg viewBox="0 0 ${String(w)} ${String(h)}" width="100%" height="${String(h)}">
${edgeLines}
${nodeCircles}
</svg>`;

  const legend = `<div class="map-legend">
  <div class="map-legend-item"><span class="map-legend-dot" style="background:#EF4444"></span> Critical conflict</div>
  <div class="map-legend-item"><span class="map-legend-dot" style="background:#F59E0B"></span> Warning</div>
  <div class="map-legend-item"><span class="map-legend-dot" style="background:#1A3358"></span> Document</div>
</div>`;

  return `<div class="map-container">${svg}${legend}</div>`;
}

/** Build a risk register from detections — nodes appearing in multiple issues. */
export function buildRiskRegister(
  detections: Detection[],
): Array<{ nodeId: string; label: string; issueCount: number; types: string[]; severity: string }> {
  const nodeIssues = new Map<string, { label: string; count: number; types: Set<string>; hasCritical: boolean }>();

  for (const d of detections) {
    const enriched = d.metadata?.['nodes'];
    const nodeArr = Array.isArray(enriched)
      ? (enriched as Array<{ id: string; title: string; source: string | null }>)
      : null;

    for (let i = 0; i < d.nodeIds.length; i++) {
      const nid = d.nodeIds[i]!;
      const label = nodeArr?.[i]
        ? (nodeArr[i]!.source?.split('/').pop() ?? nodeArr[i]!.title.slice(0, 30))
        : nid.slice(0, 8);
      const existing = nodeIssues.get(nid);
      if (existing) {
        existing.count++;
        existing.types.add(d.type);
        if (d.severity === 'critical') existing.hasCritical = true;
      } else {
        nodeIssues.set(nid, {
          label, count: 1, types: new Set([d.type]),
          hasCritical: d.severity === 'critical',
        });
      }
    }
  }

  return Array.from(nodeIssues.entries())
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([nodeId, v]) => ({
      nodeId,
      label: v.label,
      issueCount: v.count,
      types: Array.from(v.types),
      severity: v.hasCritical ? 'high' : v.count >= 3 ? 'medium' : 'low',
    }));
}
