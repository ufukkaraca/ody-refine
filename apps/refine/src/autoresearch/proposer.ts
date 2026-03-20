/**
 * LLM-based config proposer — generates new detector configs based on scores.
 * @module autoresearch/proposer
 */
import type { LLMProvider } from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';
import type { ScoreResult } from './ground-truth.js';
import type { DetectorConfig } from './config-space.js';
import type { IterationResult } from './optimize.js';

/**
 * Use LLM to propose config changes that might improve F1.
 * Sends current config, scores, and recent history for context.
 */
export async function proposeConfigChanges(
  llm: LLMProvider,
  currentConfig: DetectorConfig,
  currentScore: ScoreResult,
  recentHistory: IterationResult[],
): Promise<DetectorConfig> {
  const historyStr = recentHistory
    .map((h) =>
      `  iter=${String(h.iteration)} f1=${h.score.f1.toFixed(3)} ` +
      `p=${h.score.precision.toFixed(3)} r=${h.score.recall.toFixed(3)} ` +
      `improved=${String(h.improved)}`,
    )
    .join('\n');

  const prompt = buildPrompt(currentConfig, currentScore, historyStr);

  try {
    const response = await llm.complete([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ], { temperature: 0.7, maxTokens: 1000 });

    const parsed = parseLlmJsonResponse<Partial<RawConfig>>(response);
    if (parsed.data) {
      return mergeProposal(currentConfig, parsed.data);
    }
  } catch {
    // LLM failed — apply random perturbation
  }

  return randomPerturbation(currentConfig);
}

const SYSTEM_PROMPT = `You are a machine learning optimization assistant.
Given detector configuration parameters and performance scores (precision, recall, F1),
propose new parameter values that might improve the F1 score.

Rules:
- similarityThreshold: float between 0.3 and 0.95
- topK: integer between 3 and 30
- maxLlmCalls: integer between 1 and 20
- If recall is low, try lowering similarityThreshold or increasing topK
- If precision is low, try raising similarityThreshold or lowering topK
- Make small, targeted changes — adjust 1-2 parameters at a time

Respond with ONLY a JSON object matching the DetectorConfig shape.`;

/** Build the user prompt with config, scores, and history. */
function buildPrompt(
  config: DetectorConfig,
  score: ScoreResult,
  history: string,
): string {
  return `Current config:
${JSON.stringify(config, null, 2)}

Current scores:
  precision: ${score.precision.toFixed(3)}
  recall: ${score.recall.toFixed(3)}
  f1: ${score.f1.toFixed(3)}
  truePositives: ${String(score.truePositives)}
  falsePositives: ${String(score.falsePositives)}
  falseNegatives: ${String(score.falseNegatives)}

Recent history:
${history || '  (first iteration)'}

Propose a new config that might improve F1. Respond with JSON only.`;
}

interface RawConfig {
  contradictions?: { similarityThreshold?: number; topK?: number; maxLlmCalls?: number };
  duplicates?: { similarityThreshold?: number; topK?: number; maxLlmCalls?: number };
  staleness?: { similarityThreshold?: number; topK?: number };
  undocumented?: { similarityThreshold?: number; topK?: number };
  timeBombs?: { similarityThreshold?: number; topK?: number; requireAllNodes?: boolean };
}

/** Merge a partial proposal into the current config. */
function mergeProposal(
  base: DetectorConfig,
  proposal: Partial<RawConfig>,
): DetectorConfig {
  return {
    contradictions: {
      similarityThreshold: proposal.contradictions?.similarityThreshold ?? base.contradictions.similarityThreshold,
      topK: proposal.contradictions?.topK ?? base.contradictions.topK,
      maxLlmCalls: proposal.contradictions?.maxLlmCalls ?? base.contradictions.maxLlmCalls,
    },
    duplicates: {
      similarityThreshold: proposal.duplicates?.similarityThreshold ?? base.duplicates.similarityThreshold,
      topK: proposal.duplicates?.topK ?? base.duplicates.topK,
      maxLlmCalls: proposal.duplicates?.maxLlmCalls ?? base.duplicates.maxLlmCalls,
    },
    staleness: {
      similarityThreshold: proposal.staleness?.similarityThreshold ?? base.staleness.similarityThreshold,
      topK: proposal.staleness?.topK ?? base.staleness.topK,
    },
    undocumented: {
      similarityThreshold: proposal.undocumented?.similarityThreshold ?? base.undocumented.similarityThreshold,
      topK: proposal.undocumented?.topK ?? base.undocumented.topK,
    },
    timeBombs: {
      similarityThreshold: proposal.timeBombs?.similarityThreshold ?? base.timeBombs.similarityThreshold,
      topK: proposal.timeBombs?.topK ?? base.timeBombs.topK,
      requireAllNodes: proposal.timeBombs?.requireAllNodes ?? base.timeBombs.requireAllNodes,
    },
  };
}

/** Apply a small random perturbation as fallback. */
function randomPerturbation(config: DetectorConfig): DetectorConfig {
  const jitter = (v: number, range: number): number =>
    v + (Math.random() - 0.5) * 2 * range;

  return {
    contradictions: {
      ...config.contradictions,
      similarityThreshold: jitter(config.contradictions.similarityThreshold, 0.05),
    },
    duplicates: {
      ...config.duplicates,
      similarityThreshold: jitter(config.duplicates.similarityThreshold, 0.05),
    },
    staleness: {
      ...config.staleness,
      similarityThreshold: jitter(config.staleness.similarityThreshold, 0.05),
    },
    undocumented: {
      ...config.undocumented,
      similarityThreshold: jitter(config.undocumented.similarityThreshold, 0.05),
    },
    timeBombs: {
      ...config.timeBombs,
      similarityThreshold: jitter(config.timeBombs.similarityThreshold, 0.05),
    },
  };
}
