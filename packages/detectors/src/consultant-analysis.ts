/**
 * Consultant-grade analysis engine.
 * Sends all content to an LLM acting as a management consultant and
 * parses structured findings across 7 categories.
 * Uses streaming to provide progress feedback and avoid apparent hangs.
 * @module consultant-analysis
 */
import type { LLMProvider, ChatMessage } from '@useody/platform-core';
import {
  SYSTEM_PROMPT,
  buildUserMessage,
  isValidFinding,
  parseHealthScore,
  streamToString,
  parseOrRetry,
  buildDocumentMap,
} from './consultant-prompts.js';

// Re-export types for backward compatibility
export type {
  FindingCategory,
  ConsultingFinding,
  HealthScore,
  DocumentInfo,
  AnalysisResult,
  AnalysisInput,
} from './consultant-prompts.js';

import type { AnalysisResult, AnalysisInput } from './consultant-prompts.js';

/**
 * Run consulting-style analysis on a document corpus.
 * Sends all content to the LLM in a single call with a management-
 * consultant system prompt. For corpora that fit in context.
 */
export async function analyzeCorpus(
  input: AnalysisInput,
  llm: LLMProvider,
  options?: { maxTokens?: number; logger?: (msg: string) => void },
): Promise<AnalysisResult> {
  const log = options?.logger ?? ((): void => {});
  const docCount = input.documents.length;
  // Scale maxTokens with corpus size: base 1024 + 256 per doc, capped at 4096.
  const scaledMax = Math.min(4096, 1024 + docCount * 256);
  const maxTokens = options?.maxTokens ?? scaledMax;
  const modelId = llm.getModelId();

  if (input.documents.length === 0) {
    return emptyResult(modelId);
  }

  if (input.documents.length < 2) {
    log('Single document — cross-document analysis requires 2+ documents.');
    return {
      findings: [],
      healthScore: { overall: 100, consistency: 100, freshness: 100, ownership: 100, coverage: 100 },
      documentMap: input.documents.map((d) => ({
        path: d.path, title: d.title, lastModified: d.lastModified, topics: [],
      })),
      metadata: {
        analyzedAt: new Date().toISOString(),
        documentCount: input.documents.length,
        totalTokens: 0,
        modelUsed: modelId,
      },
    };
  }

  const label = `Analyzing ${String(input.documents.length)} documents with ${modelId}`;
  log(`${label}...`);
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage(input) },
  ];

  const response = await streamToString(llm, messages, maxTokens, log, label);
  const data = await parseOrRetry(messages, response, llm, maxTokens, log, label);

  if (!data) {
    log('Failed to parse LLM response after retry.');
    return emptyResult(modelId);
  }

  const findings = (data.findings ?? []).filter(isValidFinding);
  const healthScore = parseHealthScore(data.healthScore);
  const documentMap = buildDocumentMap(data.documentMap, input);
  const totalChars = input.documents.reduce((s, d) => s + d.content.length, 0);

  log(`Found ${String(findings.length)} findings. Health: ${String(healthScore.overall)}`);

  return {
    findings, healthScore, documentMap,
    metadata: {
      analyzedAt: new Date().toISOString(),
      documentCount: input.documents.length,
      totalTokens: Math.ceil(totalChars / 4),
      modelUsed: modelId,
    },
  };
}

/** Return a clean empty result. */
function emptyResult(modelId: string): AnalysisResult {
  return {
    findings: [],
    healthScore: { overall: 100, consistency: 100, freshness: 100, ownership: 100, coverage: 100 },
    documentMap: [],
    metadata: { analyzedAt: new Date().toISOString(), documentCount: 0, totalTokens: 0, modelUsed: modelId },
  };
}
