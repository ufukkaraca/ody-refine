/**
 * System prompt, types, and validation helpers for consultant analysis.
 * Extracted from consultant-analysis.ts to keep files under 250 lines.
 * @module consultant-prompts
 */
import type { LLMProvider, ChatMessage } from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';

/** The seven finding categories a consultant analysis produces. */
export type FindingCategory =
  | 'contradiction'
  | 'stale_commitment'
  | 'ownership_gap'
  | 'tribal_knowledge'
  | 'duplicate_truth'
  | 'commitment_without_followthrough'
  | 'decision_without_context';

/** A single finding from the consultant analysis. */
export interface ConsultingFinding {
  category: FindingCategory;
  severity: 'critical' | 'warning' | 'info';
  headline: string;
  evidence: Array<{ source: string; quote: string }>;
  businessImpact: string;
  recommendation: string;
  effort: 'quick_win' | 'medium' | 'major';
  affectedDocuments: string[];
}

/** Multi-dimensional health score for the document corpus. */
export interface HealthScore {
  overall: number;
  consistency: number;
  freshness: number;
  ownership: number;
  coverage: number;
}

/** Metadata about a single document extracted during analysis. */
export interface DocumentInfo {
  path: string;
  title: string;
  lastModified?: string;
  topics: string[];
  owner?: string;
}

/** Complete result of a consultant analysis. */
export interface AnalysisResult {
  findings: ConsultingFinding[];
  healthScore: HealthScore;
  documentMap: DocumentInfo[];
  metadata: {
    analyzedAt: string;
    documentCount: number;
    totalTokens: number;
    modelUsed: string;
  };
}

/** Input documents for analysis. */
export interface AnalysisInput {
  documents: Array<{
    path: string;
    title: string;
    content: string;
    lastModified?: string;
  }>;
}

const VALID_CATEGORIES = new Set<string>([
  'contradiction', 'stale_commitment', 'ownership_gap', 'tribal_knowledge',
  'duplicate_truth', 'commitment_without_followthrough', 'decision_without_context',
]);
const VALID_SEVERITIES = new Set<string>(['critical', 'warning', 'info']);
const VALID_EFFORTS = new Set<string>(['quick_win', 'medium', 'major']);

/** The management consultant system prompt for analysis. */
export const SYSTEM_PROMPT = [
  'You are a senior management consultant conducting a knowledge health assessment for an executive team.',
  'Analyze every document. Cite exact passages as evidence. Identify both problems AND coverage gaps.',
  '',
  '## Systematic Cross-Reference (MANDATORY)',
  'Before writing findings: extract every policy, number, deadline, and rule from EACH document. Then cross-reference each assertion against EVERY other document. Check all document pairs — do not skip any.',
  'Pay special attention to: numerical disagreements (different numbers for the same policy), cases where one doc allows what another forbids, and conflicting dates/deadlines/timelines.',
  '',
  '## 7 Categories',
  '1. contradiction — documents making conflicting claims. Numbers that don\'t match. Policies that disagree. One doc allows what another forbids.',
  '2. stale_commitment — deadlines passed, pending decisions never resolved, outdated references.',
  '3. ownership_gap — no clear process owner, overlapping responsibilities, orphaned projects. Also flag under-documented areas.',
  '4. tribal_knowledge — critical info in only one document, single points of failure. Also flag areas that seem under-documented.',
  '5. duplicate_truth — same topic in multiple places with divergent content.',
  '6. commitment_without_followthrough — stated commitments, timelines, or action items with no evidence of completion.',
  '7. decision_without_context — decisions stated without rationale, creating reversal risk if the decision-maker leaves.',
  '',
  '## Writing Rules',
  '- Headlines must name the SPECIFIC policy, number, or commitment. Never generic ("potentially outdated"). Instead: "Vacation policy: 20 days (HR handbook) vs 15 days (onboarding guide)."',
  '- Lead with business impact, use "This creates risk of..." framing. Zero jargon.',
  '- Every contradiction MUST cite both conflicting claims as exact quotes in the evidence array.',
  '',
  '## Severity: critical=money/customers/compliance/safety/passed deadlines. warning=internal conflicts, >6mo stale, ambiguous ownership. info=not-yet-divergent duplicates, non-critical single-source.',
  '',
  '## JSON Output (no fencing, no preamble)',
  '{"findings":[{"category":"<id>","severity":"<level>","headline":"<CEO-scannable>","evidence":[{"source":"<doc path>","quote":"<exact passage>"}],"businessImpact":"<what happens if ignored>","recommendation":"<specific fix>","effort":"<quick_win|medium|major>","affectedDocuments":["<paths>"]}],"healthScore":{"overall":<0-100>,"consistency":<0-100>,"freshness":<0-100>,"ownership":<0-100>,"coverage":<0-100>},"documentMap":[{"path":"<path>","title":"<title>","topics":["<topic>"],"owner":"<if identifiable>"}]}',
  '',
  'Dimensions: consistency=cross-doc agreement, freshness=currency, ownership=responsibility clarity, coverage=breadth.',
  'Write in the documents\' language. Only JSON keys and category IDs use English.',
].join('\n');

/** Build the user message with document delimiters. */
export function buildUserMessage(input: AnalysisInput): string {
  return input.documents.map((doc) => {
    const mod = doc.lastModified ? ` (Last modified: ${doc.lastModified})` : '';
    return `--- DOCUMENT: ${doc.path}${mod} ---\n${doc.content}`;
  }).join('\n\n');
}

/** Validate that a parsed object is a well-formed finding. */
export function isValidFinding(f: unknown): f is ConsultingFinding {
  if (!f || typeof f !== 'object') return false;
  const o = f as Record<string, unknown>;
  if (typeof o.category !== 'string' || !VALID_CATEGORIES.has(o.category)) return false;
  if (typeof o.severity !== 'string' || !VALID_SEVERITIES.has(o.severity)) return false;
  if (typeof o.headline !== 'string' || !Array.isArray(o.evidence)) return false;
  if (typeof o.effort !== 'string' || !VALID_EFFORTS.has(o.effort)) o.effort = 'medium';
  if (!Array.isArray(o.affectedDocuments)) o.affectedDocuments = [];
  if (typeof o.businessImpact !== 'string') o.businessImpact = '';
  if (typeof o.recommendation !== 'string') o.recommendation = '';
  return true;
}

/** Clamp a value to 0-100. */
function clamp(v: unknown): number {
  return Math.max(0, Math.min(100, Math.round(typeof v === 'number' ? v : 0)));
}

/** Parse HealthScore from LLM output, clamping each dimension. */
export function parseHealthScore(raw: unknown): HealthScore {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    overall: clamp(o.overall), consistency: clamp(o.consistency),
    freshness: clamp(o.freshness), ownership: clamp(o.ownership), coverage: clamp(o.coverage),
  };
}

/** Shape of the raw JSON the LLM produces. */
export interface LlmOutput {
  findings?: unknown[];
  healthScore?: unknown;
  documentMap?: unknown[];
}

/**
 * Accumulate a streaming LLM response, logging progress periodically.
 * Falls back to llm.complete() if the stream method throws.
 */
export async function streamToString(
  llm: LLMProvider,
  messages: ChatMessage[],
  maxTokens: number,
  log: (msg: string) => void,
  label: string,
): Promise<string> {
  try {
    const chunks: string[] = [];
    let tokenCount = 0;
    let lastLog = Date.now();
    const LOG_INTERVAL_MS = 3_000;

    for await (const token of llm.stream(messages, { temperature: 0, maxTokens })) {
      chunks.push(token);
      tokenCount++;
      const now = Date.now();
      if (now - lastLog >= LOG_INTERVAL_MS) {
        log(`${label} (${String(tokenCount)} tokens...)`);
        lastLog = now;
      }
    }
    return chunks.join('');
  } catch {
    return llm.complete(messages, { temperature: 0, maxTokens });
  }
}

/** Attempt to parse LLM response, retrying once on failure. */
export async function parseOrRetry(
  messages: ChatMessage[],
  firstResponse: string,
  llm: LLMProvider,
  maxTokens: number,
  log: (msg: string) => void,
  label: string,
): Promise<LlmOutput | null> {
  const first = parseLlmJsonResponse<LlmOutput>(firstResponse);
  if (first.data) return first.data;
  log(`${label} — retrying (response was not valid JSON)...`);
  const retry: ChatMessage[] = [
    ...messages,
    { role: 'assistant', content: firstResponse },
    { role: 'user', content: 'That was not valid JSON. Return ONLY the JSON object, no other text.' },
  ];
  const second = await streamToString(llm, retry, maxTokens, log, `${label} retry`);
  return parseLlmJsonResponse<LlmOutput>(second).data;
}

/** Merge LLM document analysis with input metadata. */
export function buildDocumentMap(raw: unknown[] | undefined, input: AnalysisInput): DocumentInfo[] {
  const idx = new Map<string, Record<string, unknown>>();
  for (const d of (Array.isArray(raw) ? raw : [])) {
    if (d && typeof d === 'object' && typeof (d as Record<string, unknown>).path === 'string') {
      idx.set((d as Record<string, unknown>).path as string, d as Record<string, unknown>);
    }
  }
  return input.documents.map((doc) => {
    const m = idx.get(doc.path);
    return {
      path: doc.path, title: doc.title, lastModified: doc.lastModified,
      topics: Array.isArray(m?.topics) ? (m.topics as string[]) : [],
      owner: typeof m?.owner === 'string' ? m.owner : undefined,
    };
  });
}
