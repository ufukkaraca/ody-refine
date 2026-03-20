/**
 * Date pattern parsing and deadline classification utilities for time bomb detection.
 * Extracted from time-bombs.ts to keep files under 250 lines.
 * @module time-bomb-utils
 */
import type { KnowledgeNode, Detection } from '@useody/platform-core';

export const DATE_PATTERN =
  /\b(Q[1-4]\s*20\d{2}|20\d{2}-\d{2}|by\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\b|deadline|due\s+date|expires?|by\s+end\s+of)/i;

export const QUARTER_PATTERN = /\bQ([1-4])\s*(20\d{2})\b/gi;
export const YYYY_MM_PATTERN = /\b(20\d{2})-(\d{2})\b/g;
export const BY_MONTH_YEAR =
  /\bby\s+(?:end\s+of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/gi;
export const BY_END_OF =
  /\bby\s+(?:end\s+of\s+)?(month|year)\b/gi;

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3,
  may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
};

const QUARTER_END_MONTH = [2, 5, 8, 11]; // Q1=Mar, Q2=Jun, Q3=Sep, Q4=Dec

const COMPLETION_RE = /\b(completed|was\s+done|shipped|resolved|closed|merged|finished|delivered|launched|migrated|moved\s+from)\b/i;

/** Check if a match position follows a document metadata label. */
function isMetadataDate(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 50), index).replace(/\*+/g, '');
  return /(?:last\s+updated|last\s+modified|updated|date|version|consolidated|created|published|generated)\s*:?\s*$/i.test(before.trimEnd());
}

/** Deadline-framing words near a YYYY-MM date. */
const DEADLINE_CONTEXT_RE = /\b(deadline|due|by|expires?|target|complete|deliver|launch|ship|release|finish|submit|migrate|renewal|until|before|review)\b/i;

/** Check if the sentence containing a YYYY-MM match has deadline-framing language. */
function hasDeadlineContext(text: string, index: number): boolean {
  let start = index;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1]!)) start--;
  let end = index;
  while (end < text.length && !/[.!?\n]/.test(text[end]!)) end++;
  const sent = text.slice(start, end);
  return DEADLINE_CONTEXT_RE.test(sent);
}

/** Check if the sentence containing index already signals a completed past event. */
function sentenceIsCompleted(text: string, index: number): boolean {
  let start = index;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1]!)) start--;
  let end = index;
  while (end < text.length && !/[.!?\n]/.test(text[end]!)) end++;
  const sent = text.slice(start, end);
  return COMPLETION_RE.test(sent);
}

/** Check if the match is inside a markdown table cell. */
function isInTableCell(text: string, index: number): boolean {
  let lineStart = index;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  return text.slice(lineStart, index).trimStart().startsWith('|');
}

/** Parsed deadline result. */
export interface ParsedDeadline {
  label: string;
  endDate: Date;
}

/** Extract deadline dates from text using regex patterns. */
export function extractDeadlines(text: string, now: Date): ParsedDeadline[] {
  const results: ParsedDeadline[] = [];
  let match: RegExpExecArray | null;

  const qp = new RegExp(QUARTER_PATTERN.source, QUARTER_PATTERN.flags);
  while ((match = qp.exec(text)) !== null) {
    if (isInTableCell(text, match.index!)) continue;
    if (sentenceIsCompleted(text, match.index!)) continue;
    const q = parseInt(match[1]!, 10);
    const year = parseInt(match[2]!, 10);
    const endMonth = QUARTER_END_MONTH[q - 1]!;
    const endDate = new Date(year, endMonth + 1, 0, 23, 59, 59);
    results.push({ label: match[0], endDate });
  }

  const ymp = new RegExp(YYYY_MM_PATTERN.source, YYYY_MM_PATTERN.flags);
  while ((match = ymp.exec(text)) !== null) {
    if (isInTableCell(text, match.index!)) continue;
    if (isMetadataDate(text, match.index!)) continue;
    if (sentenceIsCompleted(text, match.index!)) continue;
    if (!hasDeadlineContext(text, match.index!)) continue;
    const year = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10) - 1;
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);
    results.push({ label: match[0], endDate });
  }

  const bmy = new RegExp(BY_MONTH_YEAR.source, BY_MONTH_YEAR.flags);
  while ((match = bmy.exec(text)) !== null) {
    const month = MONTH_MAP[match[1]!.toLowerCase()]!;
    const year = parseInt(match[2]!, 10);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);
    results.push({ label: match[0], endDate });
  }

  const beo = new RegExp(BY_END_OF.source, BY_END_OF.flags);
  while ((match = beo.exec(text)) !== null) {
    const unit = match[1]!.toLowerCase();
    const endDate = unit === 'year'
      ? new Date(now.getFullYear(), 11, 31, 23, 59, 59)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    results.push({ label: match[0], endDate });
  }

  return results;
}

/** Classify deadline relative to now. */
export function classifyDeadline(
  deadline: ParsedDeadline,
  now: Date,
  nodeId: string,
  _nowLabel: string,
  docType?: string,
): Detection | null {
  const diff = deadline.endDate.getTime() - now.getTime();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const isMeetingNote = docType === 'meeting_notes' || docType === 'changelog';

  if (diff < 0) {
    const msPerMonth = 30 * 24 * 60 * 60 * 1000;
    const monthsAgo = Math.round(-diff / msPerMonth);
    const agoStr = monthsAgo <= 0 ? 'recently' : `${monthsAgo} month${monthsAgo === 1 ? '' : 's'} ago`;
    const severity = isMeetingNote ? 'info' as const : 'warning' as const;
    const noteCtx = isMeetingNote ? ' (mentioned in meeting notes — verify if completed)' : '';
    return {
      type: 'time_bomb', severity, nodeIds: [nodeId],
      description: `Deadline "${deadline.label}" has passed (${agoStr}).${noteCtx}`,
      suggestedAction: isMeetingNote
        ? `This deadline was mentioned in meeting notes. Check if it was completed in your task tracker.`
        : `Deadline "${deadline.label}" has passed. Update or remove.`,
      metadata: { deadline: deadline.label, expired: true, monthsAgo, docType },
    };
  }
  if (diff <= thirtyDays) {
    return {
      type: 'time_bomb', severity: 'warning', nodeIds: [nodeId],
      description: `Deadline approaching: "${deadline.label}".`,
      suggestedAction: `Deadline "${deadline.label}" approaching. Verify status.`,
      metadata: { deadline: deadline.label, expired: false, docType },
    };
  }
  return {
    type: 'time_bomb', severity: 'info', nodeIds: [nodeId],
    description: `Future deadline: "${deadline.label}".`,
    suggestedAction: `Deadline "${deadline.label}" is upcoming. Track it.`,
    metadata: { deadline: deadline.label, expired: false, docType },
  };
}

/** Extract topic words for cross-doc completion matching. */
function topicWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 5),
  );
}

/** Common words not useful for topic matching. */
const COMMON_WORDS = new Set([
  'services', 'project', 'company', 'classic',
  'document', 'created', 'space', 'pages', 'https',
  'about', 'which', 'their', 'there', 'these', 'those',
  'would', 'could', 'should', 'other', 'after', 'before',
]);

/** Find a node that may have completed the deadline referenced by another node. */
export function findCompletionNode(nodeId: string, nodeText: string, nodes: KnowledgeNode[]): string | undefined {
  const topics = new Set(
    [...topicWords(nodeText)].filter((w) => !COMMON_WORDS.has(w)),
  );
  if (topics.size < 2) return undefined;
  for (const n of nodes) {
    if (n.id === nodeId) continue;
    const t = `${n.title} ${(n.content.facts ?? []).join(' ')} ${n.content.summary}`;
    if (!COMPLETION_RE.test(t)) continue;
    const otherTopics = new Set(
      [...topicWords(t)].filter((w) => !COMMON_WORDS.has(w)),
    );
    const shared = [...otherTopics].filter((w) => topics.has(w));
    if (shared.length >= 3) return n.title;
  }
  return undefined;
}
