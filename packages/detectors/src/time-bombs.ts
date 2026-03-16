/**
 * Time bomb detector.
 * Finds date-dependent commitments that have expired or will expire soon.
 * @module time-bombs
 */
import type {
  KnowledgeNode,
  KnowledgeEdge,
  Detection,
  DetectorFn,
  LLMProvider,
} from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';
import { completeWithTimeout } from './helpers/llm-timeout.js';

const DATE_PATTERN =
  /\b(Q[1-4]\s*20\d{2}|20\d{2}-\d{2}|by\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\b|deadline|due\s+date|expires?|by\s+end\s+of)/i;

const QUARTER_PATTERN = /\bQ([1-4])\s*(20\d{2})\b/gi;
const YYYY_MM_PATTERN = /\b(20\d{2})-(\d{2})\b/g;
const BY_MONTH_YEAR =
  /\bby\s+(?:end\s+of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/gi;
const BY_END_OF =
  /\bby\s+(?:end\s+of\s+)?(month|year)\b/gi;

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3,
  may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
};

const QUARTER_END_MONTH = [2, 5, 8, 11]; // Q1=Mar, Q2=Jun, Q3=Sep, Q4=Dec

const COMPLETION_RE = /\b(complet\w+|done|shipped|resolved|closed|merged|finished|delivered)\b/i;

function topicWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 5),
  );
}

/** Common words that appear in most docs — not useful for topic matching. */
const COMMON_WORDS = new Set([
  'incari', 'services', 'project', 'porsche', 'classic',
  'document', 'created', 'space', 'pages', 'https',
  'about', 'which', 'their', 'there', 'these', 'those',
  'would', 'could', 'should', 'other', 'after', 'before',
]);

function findCompletionNode(nodeId: string, nodeText: string, nodes: KnowledgeNode[]): string | undefined {
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

interface ParsedDeadline {
  label: string;
  endDate: Date;
}

/** Extract deadline dates from text using regex patterns. */
function extractDeadlines(text: string, now: Date): ParsedDeadline[] {
  const results: ParsedDeadline[] = [];
  let match: RegExpExecArray | null;

  const qp = new RegExp(QUARTER_PATTERN.source, QUARTER_PATTERN.flags);
  while ((match = qp.exec(text)) !== null) {
    const q = parseInt(match[1]!, 10);
    const year = parseInt(match[2]!, 10);
    const endMonth = QUARTER_END_MONTH[q - 1]!;
    const endDate = new Date(year, endMonth + 1, 0, 23, 59, 59);
    results.push({ label: match[0], endDate });
  }

  const ymp = new RegExp(YYYY_MM_PATTERN.source, YYYY_MM_PATTERN.flags);
  while ((match = ymp.exec(text)) !== null) {
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
function classifyDeadline(
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
    // Meeting notes: demote to info — the task was likely completed elsewhere
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

/**
 * Detect date-dependent commitments that may have expired.
 * Parses dates without LLM; uses LLM for richer analysis when available.
 */
const detectTimeBombs: DetectorFn = async (
  nodes: KnowledgeNode[],
  _edges: KnowledgeEdge[],
  llm?: LLMProvider,
): Promise<Detection[]> => {
  const detections: Detection[] = [];
  const now = new Date();
  const nowLabel = now.toISOString().split('T')[0]!;

  for (const node of nodes) {
    const facts = node.content.facts ?? [];
    const raw = node.content.raw ?? '';
    const text = `${node.title} ${facts.join(' ')} ${node.content.summary} ${raw}`;

    if (!DATE_PATTERN.test(text)) continue;

    if (!llm) {
      const deadlines = extractDeadlines(text, now);
      if (deadlines.length === 0) {
        detections.push({
          type: 'time_bomb', severity: 'info', nodeIds: [node.id],
          description: 'Contains date keywords but no parseable deadline.',
          suggestedAction: 'Review manually for expired deadlines.',
        });
        continue;
      }
      const nodeDocType = (node.metadata?.['docType'] as string) ?? undefined;
      for (const dl of deadlines) {
        const det = classifyDeadline(dl, now, node.id, nowLabel, nodeDocType);
        if (det) detections.push(det);
      }
      continue;
    }

    const response = await completeWithTimeout(
      llm,
      [
        {
          role: 'system',
          content: [
            'You analyze text for date-dependent commitments.',
            `Today is ${nowLabel}.`,
            'Return JSON: {"hasTimeBomb":boolean,"deadline":string|null,',
            '"expired":boolean,"description":string}',
            'Keep description under 30 words.',
          ].join(' '),
        },
        { role: 'user', content: `Text: "${text.slice(0, 1000)}"` },
      ],
      { temperature: 0.1, maxTokens: 150 },
    );

    if (!response) continue;

    const parsed = parseLlmJsonResponse<{
      hasTimeBomb: boolean;
      deadline: string | null;
      expired: boolean;
      description: string;
    }>(response);

    if (parsed.data?.hasTimeBomb) {
      detections.push({
        type: 'time_bomb',
        severity: parsed.data.expired ? 'critical' : 'warning',
        nodeIds: [node.id],
        description: parsed.data.description,
        suggestedAction: parsed.data.expired
          ? `Deadline "${parsed.data.deadline}" has passed. Update or remove.`
          : `Deadline "${parsed.data.deadline}" approaching. Verify status.`,
        metadata: {
          deadline: parsed.data.deadline,
          expired: parsed.data.expired,
        },
      });
    }
  }

  // Cap total time bomb detections — more than 30 is noise
  const MAX_TIME_BOMBS = 30;
  const capped = detections.slice(0, MAX_TIME_BOMBS);

  return capped.map((det) => {
    if (det.metadata?.expired !== true) return det;
    const nodeId = det.nodeIds[0];
    if (!nodeId) return det;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return det;
    const nodeText = `${node.title} ${(node.content.facts ?? []).join(' ')} ${node.content.summary}`;
    const completionTitle = findCompletionNode(nodeId, nodeText, nodes);
    if (!completionTitle) return det;
    return {
      ...det,
      severity: 'info' as const,
      description: `Deadline passed but may have been completed — see '${completionTitle}'`,
    };
  });
};

detectTimeBombs.preFilter = {
  similarityThreshold: 0,
  topK: 0,
  requireAllNodes: true,
};

export { detectTimeBombs, extractDeadlines, classifyDeadline };
