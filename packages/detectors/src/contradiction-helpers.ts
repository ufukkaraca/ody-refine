/**
 * Heuristic helpers for the contradiction detector.
 * Extracted to keep contradictions.ts under 250 lines.
 * @module detectors/contradiction-helpers
 */
import type {
  KnowledgeNode,
  Detection,
} from '@useody/platform-core';

const NUMBER_UNIT_PATTERN =
  /\$?(\d[\d,]*(?:\.\d+)?)\s*\+?\s*(?:per\s+)?(requests?|min|minutes?|hour|hours?|day|days?|month|months?|week|weeks?|\/\w+|calls?|users?|people|persons?|employees?|members?|%|percent|gpus?|nodes?|cores?|GBs?|instances?|seconds?|tokens?)/gi;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'but', 'not', 'with', 'from', 'by', 'into', 'it', 'its',
  'this', 'that', 'we', 'our', 'all', 'use', 'uses', 'used', 'than',
]);

const CONTEXT_STOPWORDS = new Set([
  'per', 'hour', 'hours', 'min', 'minute', 'minutes',
  'day', 'days', 'week', 'weeks', 'month', 'months', 'second', 'seconds',
]);

/** A number+unit fact extracted from text. */
export interface NumberFact { value: number; unit: string; raw: string; index: number }

/** Extract number+unit pairs from text. */
export function extractNumbers(text: string): NumberFact[] {
  const results: NumberFact[] = [];
  const re = new RegExp(NUMBER_UNIT_PATTERN.source, NUMBER_UNIT_PATTERN.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1]!.replace(/,/g, ''));
    const unit = m[2]!.toLowerCase().replace(/s$/, '');
    results.push({ value, unit, raw: m[0], index: m.index });
  }
  return results;
}

/** Normalize unit names for comparison. */
export function normalizeUnit(u: string): string {
  const map: Record<string, string> = {
    min: 'minute', minute: 'minute',
    hour: 'hour', day: 'day', week: 'week', month: 'month',
    request: 'request', call: 'call',
    user: 'user', people: 'person', person: 'person',
    employee: 'person', member: 'person',
  };
  return map[u] ?? u;
}

/** Get raw text from a node for content-based heuristics. */
export function getNodeText(node: KnowledgeNode): string {
  const raw = node.content.raw ?? '';
  const facts = (node.content.facts ?? []).join(' ');
  return `${node.title} ${node.content.summary} ${facts} ${raw}`;
}

/** Extract the sentence containing the match at matchIndex. */
export function extractSentence(text: string, matchIndex: number): string {
  let start = matchIndex;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1]!)) start--;
  let end = matchIndex;
  while (end < text.length && !/[.!?\n]/.test(text[end]!)) end++;
  return text.slice(start, end).trim();
}

/** Capitalize the first letter of a string. */
export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Extract topic keywords from a node's raw content only. */
export function rawKeywords(node: KnowledgeNode): Set<string> {
  const text = node.content.raw ?? '';
  return new Set(
    text.toLowerCase().split(/\W+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !CONTEXT_STOPWORDS.has(w)),
  );
}

/** Canonical pair key for deduplication. */
export function pairKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

/** Return true if two nodes plausibly discuss the same topic. */
export function areSameTopic(a: KnowledgeNode, b: KnowledgeNode): boolean {
  const srcA = a.content.source?.sourceId ?? '';
  const srcB = b.content.source?.sourceId ?? '';
  if (srcA && srcB && srcA === srcB) return true;
  const wA = new Set(a.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  if (b.title.toLowerCase().split(/\W+/).some((w) => w.length > 3 && wA.has(w))) return true;
  const kwA = rawKeywords(a);
  const kwB = rawKeywords(b);
  const shared = [...kwA].filter((k) => kwB.has(k));
  return shared.length >= 4;
}

/** Return true if both texts share an identical long sentence. */
export function shareExactSentence(textA: string, textB: string): boolean {
  const sA = textA.split(/[.!?\n]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 20);
  const sB = new Set(textB.split(/[.!?\n]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 20));
  return sA.some((s) => sB.has(s));
}

/** Build set of entities appearing in >50% of nodes. */
export function buildHighFreqEntities(nodes: KnowledgeNode[]): Set<string> {
  if (nodes.length <= 4) return new Set();
  const freq = new Map<string, number>();
  for (const node of nodes) {
    for (const ent of node.content.entities ?? []) {
      const name = ent.name.toLowerCase();
      freq.set(name, (freq.get(name) ?? 0) + 1);
    }
  }
  const threshold = nodes.length * 0.3;
  const result = new Set<string>();
  for (const [name, count] of freq) {
    if (count > threshold) result.add(name);
  }
  return result;
}

// Boolean/policy pairs: phrase A in doc 1 contradicts phrase B in doc 2.
/** @internal */
export const BOOLEAN_PAIRS: [RegExp, RegExp, string, string][] = [
  [/\bremote[- ]first\b/i, /\b(?:in[- ]office|office[- ](?:first|required|days?)|monday|tuesday|wednesday|thursday|friday)\b/i,
    'remote-first', 'office requirement'],
  [/\b(?:allowed|can)\s+(?:to\s+)?work\s+remote/i, /\bremote\s+work\s+is\s+not\s+permitted\b/i,
    'remote work allowed', 'remote work not permitted'],
  [/\b(?:allowed|can)\s+(?:to\s+)?work\s+remote/i, /\bmust\s+work\s+from\s+the\s+office\s+full[- ]time\b/i,
    'remote work allowed', 'must work from office full-time'],
  [/\bwork\s+remote(?:ly)?\b/i, /\boffice\s+full[- ]?time\b/i,
    'remote work', 'full-time office'],
  [/\bdeprecated\b/i, /\bcurrent(?:ly)?\s+(?:supported|active|used)\b/i,
    'deprecated', 'current'],
  [/\bunder\s+a\s+minute\b/i, /\ba\s+few\s+minutes\b/i,
    'under a minute', 'a few minutes'],
  [/\bunlimited\s+(?:vacation|pto|time\s+off)\b/i, /\b\d+\s+days?\s+(?:of\s+)?(?:paid\s+)?(?:vacation|pto|time\s+off)\b/i,
    'unlimited vacation', 'limited vacation days'],
];

/** Words near enabled/disabled or required/optional that indicate a spec, not a policy. */
export const CONFIG_CONTEXT = /\b(toggle|setting|flag|config|checkbox|option|parameter|property|attribute|button|switch|mode|state|default|value|field|prerequisite|dependency|component|install|version|package|library|sdk|module)\b/i;

/** Detect contradictions from shared entities with different facts. */
export function detectFactContradiction(
  a: KnowledgeNode, b: KnowledgeNode, out: Detection[],
  highFreqEntities: Set<string>,
): void {
  const factsA = a.content.facts ?? [];
  const factsB = b.content.facts ?? [];
  if (factsA.length === 0 || factsB.length === 0) return;

  const entA = new Set((a.content.entities ?? []).map((e) => e.name.toLowerCase()));
  const entB = new Set((b.content.entities ?? []).map((e) => e.name.toLowerCase()));
  const shared = [...entA].filter((e) => entB.has(e) && !highFreqEntities.has(e));
  const meaningful = shared.filter((e) => e.length > 3);
  if (meaningful.length < 3) return;

  const setA = new Set(factsA.map((f) => f.toLowerCase()));
  const setB = new Set(factsB.map((f) => f.toLowerCase()));
  if ([...setA].every((f) => setB.has(f))) return;

  const kwA = new Set(factsA.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
  const kwB = new Set(factsB.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
  const onlyA = factsA.filter((f) => !setB.has(f.toLowerCase())).slice(0, 2);
  const onlyB = factsB.filter((f) => !setA.has(f.toLowerCase())).slice(0, 2);
  // Both sides must have unique facts — one-sided differences are gaps, not contradictions
  if (onlyA.length === 0 || onlyB.length === 0) return;
  if (![...kwA].some((k) => kwB.has(k))) return;

  const quoteA = onlyA.join('; ');
  const quoteB = onlyB.join('; ');

  const topic = meaningful.slice(0, 3).join(', ');
  out.push({
    type: 'contradiction', severity: 'info', nodeIds: [a.id, b.id],
    description:
      `When discussing ${topic}, "${a.title}" states: ${quoteA} — while "${b.title}" states: ${quoteB}`,
    suggestedAction: `Review "${a.title}" and "${b.title}" for consistency.`,
    metadata: {
      sharedEntities: meaningful, factsA: onlyA, factsB: onlyB,
      claimA: quoteA, claimB: quoteB, topic,
    },
  });
}
