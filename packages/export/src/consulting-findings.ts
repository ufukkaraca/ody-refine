/**
 * Finding renderers for the consulting-grade health assessment.
 * Grouped findings with enhanced evidence, "Why this matters" callouts,
 * and category narrative intros.
 * @module consulting-findings
 */

import type { ConsultingFinding, FindingCategory } from './consulting-types.js';
import { CATEGORY_LABELS, EFFORT_LABELS, CATEGORY_ICONS } from './consulting-types.js';
import { escapeHtml } from './html-template.js';

/** Category severity priority for sorting groups. */
export const CATEGORY_WEIGHT: Record<string, number> = {
  contradiction: 0, stale_commitment: 1, ownership_gap: 2,
  tribal_knowledge: 3, commitment_without_followthrough: 4,
  duplicate_truth: 5, decision_without_context: 6,
};

/** Render evidence for a finding with Claim A/B labels and bold highlighting. */
export function renderEvidence(f: ConsultingFinding): string {
  if (f.evidence.length >= 2) {
    return `<div class="evidence-pair">
  <div class="evidence-block claim-a">
    <span class="evidence-label">Claim A</span>
    <span class="evidence-source">${escapeHtml(f.evidence[0]!.source)}</span>
    <div class="evidence-text">&ldquo;${escapeHtml(f.evidence[0]!.quote)}&rdquo;</div>
  </div>
  <div class="evidence-vs" aria-hidden="true">VS</div>
  <div class="evidence-block claim-b">
    <span class="evidence-label">Claim B</span>
    <span class="evidence-source">${escapeHtml(f.evidence[1]!.source)}</span>
    <div class="evidence-text">&ldquo;${escapeHtml(f.evidence[1]!.quote)}&rdquo;</div>
  </div>
</div>`;
  }
  if (f.evidence.length === 1) {
    return `<div class="evidence-single"><span class="evidence-source">${escapeHtml(f.evidence[0]!.source)}</span><div class="evidence-text">&ldquo;${escapeHtml(f.evidence[0]!.quote)}&rdquo;</div></div>`;
  }
  return '';
}

/** Render a "Why this matters" callout below the evidence. */
export function renderWhyItMatters(f: ConsultingFinding): string {
  const impactClass = f.severity === 'critical' ? '' :
    f.severity === 'warning' ? ' warning-impact' : ' info-impact';
  return `<div class="why-it-matters${impactClass}">
  <strong>Why this matters:</strong> ${escapeHtml(f.businessImpact)}
</div>`;
}

/** Render a single finding card with enhanced evidence. */
export function renderFinding(f: ConsultingFinding): string {
  const effort = EFFORT_LABELS[f.effort];
  const effortHtml = effort
    ? ` <span class="effort-badge" style="color:${effort.color};background:${effort.bg}">${escapeHtml(effort.label)}</span>`
    : '';

  const docsHtml = f.affectedDocuments.length > 0
    ? `<div class="finding-docs">${f.affectedDocuments.map((d) => `<span class="doc-tag">${escapeHtml(d.split('/').pop() ?? d)}</span>`).join(' ')}</div>`
    : '';

  return `<div class="finding ${f.severity}">
  <div class="finding-header">
    <span class="sev-badge ${f.severity}">${f.severity}</span>
    <span class="finding-headline">${escapeHtml(f.headline)}</span>${effortHtml}
  </div>
  ${renderEvidence(f)}
  ${renderWhyItMatters(f)}
  <div class="finding-recommendation"><strong>Recommendation:</strong> ${escapeHtml(f.recommendation)}</div>
  ${docsHtml}
</div>`;
}

/** Generate a narrative intro for a category group. */
export function categoryIntro(category: FindingCategory, items: ConsultingFinding[]): string {
  const docs = new Set(items.flatMap((f) => f.affectedDocuments));
  const critCount = items.filter((f) => f.severity === 'critical').length;
  const areas = docs.size > 0 ? `, affecting ${String(docs.size)} document${docs.size !== 1 ? 's' : ''}` : '';
  const severity = critCount > 0 ? ` (${String(critCount)} critical)` : '';
  const n = items.length;

  const templates: Record<string, string> = {
    contradiction: `Your documentation shows disagreement in ${String(n)} area${n !== 1 ? 's' : ''}${areas}${severity}.`,
    stale_commitment: `${String(n)} commitment${n !== 1 ? 's' : ''} may no longer reflect current reality${areas}.`,
    ownership_gap: `${String(n)} area${n !== 1 ? 's lack' : ' lacks'} clear ownership${areas}.`,
    tribal_knowledge: `Critical knowledge exists in only one place in ${String(n)} case${n !== 1 ? 's' : ''}${areas}.`,
    duplicate_truth: `The same topic is documented differently in ${String(n)} instance${n !== 1 ? 's' : ''}${areas}.`,
    commitment_without_followthrough: `${String(n)} commitment${n !== 1 ? 's appear' : ' appears'} to lack follow-through${areas}.`,
    decision_without_context: `${String(n)} decision${n !== 1 ? 's lack' : ' lacks'} documented rationale${areas}.`,
  };
  return templates[category] ?? `${String(n)} finding${n !== 1 ? 's' : ''} in this category.`;
}

/**
 * Render all findings grouped by category with icons and narrative intros.
 * Groups are sorted by category severity weight, findings within each group
 * by individual severity.
 */
export function renderFindingsGrouped(findings: ConsultingFinding[]): string {
  if (findings.length === 0) return '';
  const groups = new Map<FindingCategory, ConsultingFinding[]>();
  for (const f of findings) {
    const list = groups.get(f.category) ?? [];
    list.push(f);
    groups.set(f.category, list);
  }
  const sevOrd: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sortedGroups = Array.from(groups.entries())
    .sort((a, b) => (CATEGORY_WEIGHT[a[0]] ?? 9) - (CATEGORY_WEIGHT[b[0]] ?? 9));

  return sortedGroups.map(([category, catFindings]) => {
    const sorted = catFindings.sort((a, b) =>
      (sevOrd[a.severity] ?? 9) - (sevOrd[b.severity] ?? 9));
    const label = CATEGORY_LABELS[category] ?? category;
    const icon = CATEGORY_ICONS[category] ?? '';
    const intro = categoryIntro(category, catFindings);
    const cards = sorted.map(renderFinding).join('\n');
    return `<div class="category-group">
  <div class="category-header"><span class="category-icon">${icon}</span> ${escapeHtml(label)}<span class="category-count">${String(catFindings.length)}</span></div>
  <p class="category-intro">${escapeHtml(intro)}</p>
  <div class="findings-list">${cards}</div>
</div>`;
  }).join('\n');
}
