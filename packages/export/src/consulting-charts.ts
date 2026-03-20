/**
 * SVG chart generators for the consulting-grade health report.
 * Animated radar chart, score arc, and heatmap coverage map.
 * Pure functions — no external dependencies.
 * @module consulting-charts
 */

import type { HealthScore, DocumentInfo, ConsultingFinding } from './consulting-types.js';
import { escapeHtml } from './html-template.js';

/** Dimension definitions for the radar chart (4 axes). */
const DIMENSIONS: Array<{ key: keyof HealthScore; label: string }> = [
  { key: 'consistency', label: 'Consistency' },
  { key: 'freshness', label: 'Freshness' },
  { key: 'ownership', label: 'Ownership' },
  { key: 'coverage', label: 'Coverage' },
];

/** Point on the radar chart. */
interface RadarPoint { x: number; y: number }

/** Calculate a point on the radar for a given axis and value. */
function radarPoint(
  axisIndex: number, total: number, value: number,
  cx: number, cy: number, r: number,
): RadarPoint {
  const angle = (2 * Math.PI * axisIndex) / total - Math.PI / 2;
  const dist = (value / 100) * r;
  return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
}

/**
 * Render an animated SVG radar/spider chart showing 4 health dimensions.
 * Uses CSS classes for draw-on-load animation.
 */
export function renderRadarChart(score: HealthScore): string {
  const cx = 150, cy = 140, r = 100, n = DIMENSIONS.length;

  const gridRings = [25, 50, 75, 100].map((pct) => {
    const pts = Array.from({ length: n }, (_, i) => radarPoint(i, n, pct, cx, cy, r));
    const path = pts.map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
    return `<path d="${path}" fill="none" stroke="rgba(20,15,10,0.08)" stroke-width="1"/>`;
  }).join('\n');

  const axisLines = DIMENSIONS.map((_, i) => {
    const p = radarPoint(i, n, 100, cx, cy, r);
    return `<line x1="${String(cx)}" y1="${String(cy)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="rgba(20,15,10,0.06)" stroke-width="1"/>`;
  }).join('\n');

  const scorePts = DIMENSIONS.map((d, i) => radarPoint(i, n, score[d.key], cx, cy, r));
  const scorePath = scorePts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';

  const labels = DIMENSIONS.map((d, i) => {
    const p = radarPoint(i, n, 100, cx, cy, r + 24);
    const val = score[d.key];
    const anchor = p.x < cx - 5 ? 'end' : p.x > cx + 5 ? 'start' : 'middle';
    return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${anchor}"
  font-size="10" font-weight="600" fill="#5c4f42">${escapeHtml(d.label)}</text>
<text x="${p.x.toFixed(1)}" y="${(p.y + 14).toFixed(1)}" text-anchor="${anchor}"
  font-size="11" font-weight="800" fill="#17110c">${String(val)}</text>`;
  }).join('\n');

  const dots = scorePts.map((p) =>
    `<circle class="radar-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#bf5226"/>`,
  ).join('\n');

  const dimDesc = DIMENSIONS.map((d) => `${d.label}: ${String(score[d.key])}`).join(', ');
  return `<div class="radar-wrap">
<svg viewBox="0 0 300 280" width="100%" role="img" aria-label="Radar chart showing health dimensions: ${dimDesc}">
${gridRings}
${axisLines}
<path class="radar-fill-area" d="${scorePath}" fill="rgba(191,82,38,0.12)" stroke="none"/>
<path class="radar-polygon" d="${scorePath}" fill="none" stroke="#bf5226" stroke-width="2"/>
${dots}
${labels}
</svg>
</div>`;
}

/** Map score to a letter grade for immediate visceral impact. */
function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

/** Map score to a short descriptor. */
function scoreToLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Needs Work';
  if (score >= 50) return 'At Risk';
  return 'Critical';
}

/** Render the health score as an animated SVG arc gauge with letter grade. */
export function renderScoreArc(overall: number): string {
  const r = 68;
  const circ = 2 * Math.PI * r;
  const offset = circ - (overall / 100) * circ;
  const color = overall >= 80 ? '#2d8a54' : overall >= 50 ? '#b8860b' : '#c03030';
  const grade = scoreToGrade(overall);
  const gradeLabel = scoreToLabel(overall);
  const glowColor = overall >= 80
    ? 'rgba(45,138,84,0.25)' : overall >= 50
      ? 'rgba(184,134,11,0.25)' : 'rgba(192,48,48,0.25)';
  return `<div class="score-main">
<svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Health score: ${String(overall)} out of 100, grade ${grade}">
  <defs>
    <filter id="score-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <circle cx="90" cy="90" r="${String(r)}" stroke="rgba(20,15,10,0.06)" stroke-width="12" fill="none"/>
  <circle class="score-arc-animated" cx="90" cy="90" r="${String(r)}" stroke="${color}" stroke-width="12" fill="none"
    stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
    transform="rotate(-90 90 90)" stroke-linecap="round" filter="url(#score-glow)"
    style="--glow-color:${glowColor}"/>
  <text class="score-number-animated" x="90" y="82" text-anchor="middle" font-size="44" font-weight="800" fill="var(--text-primary, #17110c)">${String(overall)}</text>
  <text x="90" y="102" text-anchor="middle" font-size="10" font-weight="600" fill="var(--text-muted, #8a7e72)"
    letter-spacing="0.1em">OUT OF 100</text>
</svg>
<div class="score-grade" style="color:${color}">${grade}</div>
<div class="score-label">${escapeHtml(gradeLabel)}</div>
</div>`;
}

/** Topic with document count and status for the heatmap. */
interface TopicHeat {
  topic: string;
  count: number;
  status: 'healthy' | 'conflicted' | 'thin';
}

/**
 * Render a knowledge coverage heatmap from the document corpus.
 * Classifies topics as healthy (2+ docs, no conflicts), conflicted, or thin.
 */
export function renderCoverageMap(
  docMap: DocumentInfo[],
  findings?: ConsultingFinding[],
): string {
  if (docMap.length === 0) return '';

  const topicCounts = new Map<string, number>();
  for (const doc of docMap) {
    for (const topic of doc.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }

  // Build a set of conflicted topics from findings
  const conflictedTopics = new Set<string>();
  if (findings) {
    for (const f of findings) {
      if (f.category === 'contradiction' || f.category === 'duplicate_truth') {
        for (const doc of f.affectedDocuments) {
          const name = doc.split('/').pop() ?? doc;
          // Match topic names against document names loosely
          for (const topic of topicCounts.keys()) {
            if (name.toLowerCase().includes(topic.toLowerCase())
                || topic.toLowerCase().includes(name.replace(/\.md$/i, '').toLowerCase())) {
              conflictedTopics.add(topic);
            }
          }
        }
      }
    }
  }

  const sorted: TopicHeat[] = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({
      topic,
      count,
      status: conflictedTopics.has(topic) ? 'conflicted' as const
        : count >= 2 ? 'healthy' as const : 'thin' as const,
    }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length === 0) return '';

  const cells = sorted.map((t, i) => {
    const dotClass = t.status === 'healthy' ? 'green'
      : t.status === 'conflicted' ? 'red' : 'amber';
    return `<div class="heatmap-cell ${t.status}" style="--i:${String(i)}">
  <span class="heatmap-dot ${dotClass}" aria-hidden="true"></span>
  <div class="heatmap-topic">${escapeHtml(t.topic)}</div>
  <div class="heatmap-count">${String(t.count)} doc${t.count !== 1 ? 's' : ''}</div>
</div>`;
  }).join('\n');

  const legend = `<div style="display:flex;gap:1rem;margin-bottom:0.75rem;font-size:0.65rem;color:var(--text-muted);flex-wrap:wrap">
  <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--color-success);vertical-align:middle;margin-right:3px"></span>Well-covered</span>
  <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--sev-critical);vertical-align:middle;margin-right:3px"></span>Has conflicts</span>
  <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--sev-warning);vertical-align:middle;margin-right:3px"></span>Under-documented</span>
</div>`;

  const thinCount = sorted.filter((t) => t.status === 'thin').length;
  const conflictCount = sorted.filter((t) => t.status === 'conflicted').length;
  let callout = '';
  if (thinCount > 0 || conflictCount > 0) {
    const parts: string[] = [];
    if (thinCount > 0) parts.push(`${String(thinCount)} topic${thinCount !== 1 ? 's' : ''} documented in only one place`);
    if (conflictCount > 0) parts.push(`${String(conflictCount)} topic${conflictCount !== 1 ? 's have' : ' has'} conflicting information`);
    callout = `<div style="font-size:0.82rem;color:var(--sev-warning);font-style:italic;padding:0.5rem 0.75rem;background:var(--sev-warning-bg);border-radius:var(--radius-sm);margin-top:0.75rem">${parts.join('. ')}.</div>`;
  }

  return `${legend}<div class="heatmap-grid">${cells}</div>${callout}`;
}
