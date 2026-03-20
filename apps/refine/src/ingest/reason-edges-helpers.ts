/**
 * Heuristic helpers for edge reasoning.
 * Extracted to keep reason-edges.ts under 250 lines.
 * @module ingest/reason-edges-helpers
 */
import type { KnowledgeNode } from '@useody/platform-core';

// Opposing phrase pairs for heuristic edge reasoning.
const OPPOSING_PAIRS: [string, string][] = [
  ['remote-first', 'office'],
  ['remote first', 'office'],
  ['work remotely', 'office full-time'],
  ['work remotely', 'not permitted'],
  ['allowed to work remote', 'must work from the office'],
  ['deprecated', 'current'],
];

/** Extract numeric values with context from text. */
export function extractNumbers(text: string): { value: number; context: string }[] {
  const results: { value: number; context: string }[] = [];
  const patterns = [
    /\$?(\d[\d,]*(?:\.\d+)?)\s*(?:per\s+)?(requests?|calls?|days?|hours?|minutes?|min|sec|seconds?|gpus?|cores?|GBs?|nodes?|instances?|tokens?)/gi,
    /\$(\d[\d,]*(?:\.\d+)?)/g,
    /(\d[\d,]*(?:\.\d+)?)%/g,
    /(\d[\d,]*(?:\.\d+)?)\s+(?:per\s+)?(minute|hour|day|month|year|week)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1] ?? match[0];
      const value = Number(raw.replace(/,/g, ''));
      if (!Number.isNaN(value) && value > 0) {
        let start = match.index;
        while (start > 0 && !/[.!?\n]/.test(text[start - 1]!)) start--;
        let end = match.index + match[0].length;
        while (end < text.length && !/[.!?\n]/.test(text[end]!)) end++;
        results.push({ value, context: text.slice(start, end).trim() });
      }
    }
  }

  return results;
}

/** Check if two nodes have contradicting numbers in the same context. */
export function detectNumberContradiction(
  a: KnowledgeNode,
  b: KnowledgeNode,
): { contradicts: boolean; reason: string } {
  const textA = a.content.raw ?? a.content.summary;
  const textB = b.content.raw ?? b.content.summary;
  const numsA = extractNumbers(textA);
  const numsB = extractNumbers(textB);

  const COLLOQUIAL = /\b(sure|certain|confident|probably|maybe|likely|unlikely)\b/i;
  const HTTP_STATUS = /\b(status|response|http|code|error)\b/i;
  const isHttpCode = (n: { value: number; context: string }): boolean =>
    n.value >= 100 && n.value <= 599 && HTTP_STATUS.test(n.context);
  const cleanA = numsA.filter((n) => !COLLOQUIAL.test(n.context) && !isHttpCode(n));
  const cleanB = numsB.filter((n) => !COLLOQUIAL.test(n.context) && !isHttpCode(n));

  for (const na of cleanA) {
    for (const nb of cleanB) {
      if (na.value === nb.value) continue;
      const ctxA = na.context.toLowerCase();
      const ctxB = nb.context.toLowerCase();

      // If both numbers appear in both contexts, the nodes AGREE (same sentence,
      // different attributes like "$1M raise at $8M cap"). Not a contradiction.
      const naStr = String(na.value);
      const nbStr = String(nb.value);
      if (ctxA.includes(nbStr) && ctxB.includes(naStr)) continue;

      const GENERIC = new Set([
        'the', 'and', 'for', 'are', 'with', 'per', 'our',
        'day', 'days', 'hour', 'hours', 'month', 'months',
        'year', 'years', 'week', 'weeks', 'minute', 'minutes',
        'within', 'first', 'must', 'all', 'your', 'from',
        'requires', 'manager', 'approval', 'team',
      ]);
      const sharedWords = ctxA.split(/\s+/).filter(
        (w) => w.length >= 3 && !GENERIC.has(w) && ctxB.includes(w),
      );
      if (sharedWords.length >= 3) {
        return {
          contradicts: true,
          reason: `Conflicting numbers: ${na.value} vs ${nb.value} ` +
            `(context: "${na.context}" vs "${nb.context}")`,
        };
      }
    }
  }

  return { contradicts: false, reason: '' };
}

/** Check if two nodes contain opposing concepts. */
export function detectNegation(
  a: KnowledgeNode,
  b: KnowledgeNode,
): { contradicts: boolean; reason: string } {
  const textA = (a.content.raw ?? a.content.summary).toLowerCase();
  const textB = (b.content.raw ?? b.content.summary).toLowerCase();

  for (const [word1, word2] of OPPOSING_PAIRS) {
    const aHas1 = textA.includes(word1);
    const aHas2 = textA.includes(word2);
    const bHas1 = textB.includes(word1);
    const bHas2 = textB.includes(word2);

    if ((aHas1 && bHas2 && !aHas2) || (aHas2 && bHas1 && !aHas1)) {
      return {
        contradicts: true,
        reason: `Opposing concepts: "${word1}" vs "${word2}" ` +
          `in "${a.title}" and "${b.title}"`,
      };
    }
  }

  return { contradicts: false, reason: '' };
}

/** Date patterns to detect temporal content. */
const DATE_REGEX = /\b(Q[1-4]\s+20\d{2}|20\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+20\d{2})\b/gi;

/** Extract dates from text. Returns approximate timestamps. */
export function extractDates(text: string): Date[] {
  const dates: Date[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(DATE_REGEX.source, DATE_REGEX.flags);

  while ((match = regex.exec(text)) !== null) {
    const raw = match[1]!;
    const parsed = parseApproxDate(raw);
    if (parsed) dates.push(parsed);
  }

  return dates;
}

/** Parse approximate date from text. */
function parseApproxDate(raw: string): Date | null {
  const qMatch = raw.match(/Q([1-4])\s+(20\d{2})/);
  if (qMatch) {
    const quarter = Number(qMatch[1]);
    const year = Number(qMatch[2]);
    return new Date(year, (quarter - 1) * 3, 1);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Check if one node temporally supersedes another on the same topic. */
export function detectTemporalSupersession(
  a: KnowledgeNode,
  b: KnowledgeNode,
): { supersedes: boolean; newerId: string; olderId: string; reason: string } {
  // Nodes from the same source document are sibling sections, not versions.
  const srcA = a.content.source?.sourceId ?? '';
  const srcB = b.content.source?.sourceId ?? '';
  if (srcA && srcB && srcA === srcB) {
    return { supersedes: false, newerId: '', olderId: '', reason: '' };
  }

  const textA = a.content.raw ?? a.content.summary;
  const textB = b.content.raw ?? b.content.summary;
  const datesA = extractDates(textA);
  const datesB = extractDates(textB);

  if (datesA.length === 0 || datesB.length === 0) {
    return { supersedes: false, newerId: '', olderId: '', reason: '' };
  }

  const wordsA = new Set(a.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const sharedTitle = [...wordsA].filter((w) => wordsB.has(w)).length;
  if (sharedTitle === 0) {
    return { supersedes: false, newerId: '', olderId: '', reason: '' };
  }

  const latestA = Math.max(...datesA.map((d) => d.getTime()));
  const latestB = Math.max(...datesB.map((d) => d.getTime()));

  if (latestA === latestB) {
    return { supersedes: false, newerId: '', olderId: '', reason: '' };
  }

  const [newerId, olderId] = latestA > latestB ? [a.id, b.id] : [b.id, a.id];
  const [newerTitle, olderTitle] = latestA > latestB
    ? [a.title, b.title]
    : [b.title, a.title];

  return {
    supersedes: true,
    newerId,
    olderId,
    reason: `"${newerTitle}" has newer dates than "${olderTitle}"`,
  };
}
