/**
 * LLM validation loop that filters false positive detections
 * and enriches real findings with impact and explanation.
 * @module detect/validate-detections
 */

import type { Detection, KnowledgeNode, LLMProvider } from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';

/** A detection enriched with LLM validation results. */
export interface ValidatedDetection extends Detection {
  validated: true;
  isReal: boolean;
  impact: string;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
}

/** Options for the validation step. */
export interface ValidateOptions {
  /** Maximum number of detections to validate (default: 20). */
  maxValidations?: number;
  /** Batch size for concurrent LLM calls (default: 5). */
  batchSize?: number;
  /** Timeout per LLM call in milliseconds (default: 5000). */
  timeoutMs?: number;
}

/** Raw structure expected from the LLM response. */
interface LlmValidationResult {
  isReal: boolean;
  explanation: string;
  impact: string;
  confidence: 'high' | 'medium' | 'low';
}

/** Get a short excerpt from a node (first 300 chars of raw or summary). */
function getExcerpt(node: KnowledgeNode): string {
  const raw = node.content.raw ?? node.content.summary ?? '';
  return raw.length > 300 ? raw.slice(0, 300) + '...' : raw;
}

/** Build the validation prompt for a two-node contradiction detection. */
function buildPrompt(
  d: Detection,
  nodeA: KnowledgeNode,
  nodeB: KnowledgeNode,
): string {
  const excerptA = getExcerpt(nodeA);
  const excerptB = getExcerpt(nodeB);
  const sourceA = nodeA.content.source?.sourceId ?? nodeA.id;
  const sourceB = nodeB.content.source?.sourceId ?? nodeB.id;

  return `Two documentation sections may contradict each other.

Section A: "${nodeA.title}" (file: ${sourceA})
"${excerptA}"

Section B: "${nodeB.title}" (file: ${sourceB})
"${excerptB}"

Flagged as: ${d.description}

Is this a REAL contradiction that would confuse a reader?
Rules:
- Two sections describing the same thing differently is NOT a contradiction
- Different numbers for DIFFERENT things is NOT a contradiction
- A real contradiction = conflicting instructions about the SAME topic

Reply JSON only:
{"isReal":boolean,"explanation":"why this is/isn't a contradiction","impact":"what happens if not fixed","confidence":"high|medium|low"}`;
}

/** Call LLM with a 5-second timeout using Promise.race. */
async function completeWithTimeout(
  llm: LLMProvider,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('LLM validation timeout')), timeoutMs),
  );
  const call = llm.complete(
    [{ role: 'user', content: prompt }],
    { maxTokens: 300 },
  );
  return Promise.race([call, timeout]);
}

/** Validate a single detection; falls back to isReal=true on error. */
async function validateOne(
  d: Detection,
  nodeMap: Map<string, KnowledgeNode>,
  llm: LLMProvider,
  timeoutMs: number,
): Promise<ValidatedDetection> {
  const nodeA = d.nodeIds[0] ? nodeMap.get(d.nodeIds[0]) : undefined;
  const nodeB = d.nodeIds[1] ? nodeMap.get(d.nodeIds[1]) : undefined;

  if (!nodeA || !nodeB) {
    return {
      ...d,
      validated: true,
      isReal: true,
      impact: '',
      confidence: 'low',
      explanation: 'Insufficient node data for validation.',
    };
  }

  try {
    const prompt = buildPrompt(d, nodeA, nodeB);
    const raw = await completeWithTimeout(llm, prompt, timeoutMs);
    const result = parseLlmJsonResponse<LlmValidationResult>(raw);
    const val = result.data;

    if (!val || typeof val.isReal !== 'boolean') {
      return {
        ...d,
        validated: true,
        isReal: true,
        impact: '',
        confidence: 'low',
        explanation: 'LLM parse failed — retained as candidate.',
      };
    }

    return {
      ...d,
      validated: true,
      isReal: val.isReal,
      impact: val.impact ?? '',
      confidence: val.confidence ?? 'low',
      explanation: val.explanation ?? '',
    };
  } catch {
    return {
      ...d,
      validated: true,
      isReal: true,
      impact: '',
      confidence: 'low',
      explanation: 'Validation skipped (timeout or error).',
    };
  }
}

/**
 * Run LLM validation on a list of detections.
 *
 * Processes up to maxValidations (default 20) in batches of 5.
 * Detections beyond the limit are returned with isReal=true (conservative).
 *
 * @param detections  Raw detections from the heuristic phase.
 * @param nodeMap     Map of node ID → KnowledgeNode for content lookup.
 * @param llm         LLM provider to call.
 * @param options     Tuning options (maxValidations, batchSize, timeoutMs).
 * @param onProgress  Optional callback invoked after each batch.
 */
export async function validateDetections(
  detections: Detection[],
  nodeMap: Map<string, KnowledgeNode>,
  llm: LLMProvider,
  options?: ValidateOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ValidatedDetection[]> {
  const maxValidations = options?.maxValidations ?? 20;
  const batchSize = options?.batchSize ?? 5;
  const timeoutMs = options?.timeoutMs ?? 5000;

  const toValidate = detections.slice(0, maxValidations);
  const remainder: ValidatedDetection[] = detections
    .slice(maxValidations)
    .map((d) => ({
      ...d,
      validated: true as const,
      isReal: true,
      impact: '',
      confidence: 'low' as const,
      explanation: 'Not validated (limit exceeded).',
    }));

  const results: ValidatedDetection[] = [];

  for (let i = 0; i < toValidate.length; i += batchSize) {
    const batch = toValidate.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((d) => validateOne(d, nodeMap, llm, timeoutMs)),
    );
    results.push(...batchResults);
    onProgress?.(results.length, toValidate.length);
  }

  return [...results, ...remainder];
}
