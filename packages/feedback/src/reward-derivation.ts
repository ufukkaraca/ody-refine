/**
 * Derives rewards and preference pairs from interaction signals.
 * @module feedback/reward-derivation
 */

import type { Detection, KnowledgeNode, PreferencePair } from '@useody/platform-core';
import type {
  CorrectionSignal,
  InteractionSignal,
  ReputationScore,
  RewardDerivation,
} from './types.js';
import { SIGNAL_WEIGHTS } from './types.js';

/** UUID v4 pattern used to detect invalid prompt content. */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Derive a reward from an interaction signal, factoring in user reputation.
 */
export function deriveReward(signal: InteractionSignal, reputation: ReputationScore): RewardDerivation {
  const weights = SIGNAL_WEIGHTS[signal.signalType];
  const adjustedWeight = weights.weight * reputation.score;

  let reason: string;
  switch (signal.signalType) {
    case 'accepted':
      reason = 'User accepted the answer';
      break;
    case 'rejected':
      reason = 'User rejected the answer';
      break;
    case 'corrected':
      reason = `User provided correction (reputation: ${reputation.score.toFixed(2)})`;
      break;
    case 'escalated':
      reason = 'User escalated to another source';
      break;
    case 'shared':
      reason = 'User shared the answer with others';
      break;
    case 'follow_up':
      reason = 'User asked a follow-up question';
      break;
    case 'emoji_positive':
      reason = 'Positive emoji reaction (thumbsup, check, heart)';
      break;
    case 'emoji_negative':
      reason = 'Negative emoji reaction (thumbsdown, x, confused)';
      break;
    case 'reply_positive':
      reason = 'Reply with positive sentiment';
      break;
    case 'reply_negative':
      reason = 'Reply with negative sentiment';
      break;
    default:
      reason = `Signal: ${signal.signalType}`;
  }

  return {
    signalId: signal.id,
    rewardType: weights.type,
    weight: Math.min(1, Math.max(0, adjustedWeight)),
    preferencePairGenerated: false,
    reason,
  };
}

/**
 * Generate a topic-based question from node content when no original question is available.
 * Extracts a meaningful topic from the content to create a natural question.
 */
export function generateQuestionFromContent(content: string): string {
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  const topic = firstLine.length > 80 ? firstLine.slice(0, 80) : firstLine;
  return `What is the current policy on ${topic}?`;
}

/**
 * Generate a natural language prompt from a detection and its referenced nodes.
 * Extracts the topic from the detection description or node titles to form a question.
 * Returns null if no meaningful prompt can be derived.
 */
export function generatePromptFromDetection(
  detection: Detection,
  nodes: KnowledgeNode[],
): string | null {
  // Try to extract topic from the detection description
  const desc = detection.description.trim();
  if (desc.length > 0) {
    // Use the detection description to form a targeted question
    const topic = desc.length > 120 ? desc.slice(0, 120) : desc;
    return `What is the correct information regarding: ${topic}`;
  }

  // Fall back to node titles
  const titles = nodes
    .filter((n) => detection.nodeIds.includes(n.id))
    .map((n) => n.title)
    .filter((t) => t.trim().length > 0);

  if (titles.length > 0) {
    return `What is the current policy on ${titles.join(' and ')}?`;
  }

  // Fall back to node content summaries
  const summaries = nodes
    .filter((n) => detection.nodeIds.includes(n.id))
    .map((n) => n.content.summary)
    .filter((s) => s.trim().length > 0);

  if (summaries.length > 0) {
    return generateQuestionFromContent(summaries[0]!);
  }

  return null;
}

/**
 * Check whether a string looks like a UUID or a comma-separated list of UUIDs.
 * Used to prevent UUID-based prompts from leaking into training data.
 */
export function looksLikeUuid(text: string): boolean {
  const parts = text.split(/[, ]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length > 0 && parts.every((p) => UUID_V4_PATTERN.test(p));
}

/**
 * Derive a preference pair from a correction signal.
 * Only generates pairs for 'corrected' signals with sufficient reputation.
 * Returns null if reputation is below 0.4 (queued for review),
 * or if no meaningful prompt can be generated (avoids UUID-based prompts).
 *
 * @param signal - The interaction signal
 * @param originalAnswer - The model's original response
 * @param correctedText - The user's corrected text
 * @param reputation - The correcting user's reputation
 * @param originalQuestion - The actual user question (optional)
 * @param nodeContent - Content from referenced nodes for question generation (optional)
 */
export function derivePreferencePair(
  signal: InteractionSignal,
  originalAnswer: string,
  correctedText: string,
  reputation: ReputationScore,
  originalQuestion?: string,
  nodeContent?: string,
): PreferencePair | null {
  if (signal.signalType !== 'corrected') {
    return null;
  }

  if (reputation.score < 0.4) {
    return null;
  }

  const confidence = reputation.score >= 0.8 ? 1.0 : 0.6;

  let prompt: string | null = null;
  if (originalQuestion && !looksLikeUuid(originalQuestion)) {
    prompt = originalQuestion;
  } else if (nodeContent) {
    prompt = generateQuestionFromContent(nodeContent);
  }

  // If no prompt could be derived, return null rather than embedding UUIDs
  if (!prompt) {
    return null;
  }

  return {
    prompt,
    chosen: correctedText,
    rejected: originalAnswer,
    metadata: {
      conflictType: 'contradiction',
      resolvedBy: signal.userId,
      resolvedAt: signal.createdAt,
      confidence,
      sourceNodeIds: signal.questionNodeIds,
    },
  };
}

/**
 * Derive a preference pair directly from a correction signal.
 * Simpler than detection-based pairs: the user already provided
 * the chosen (corrected) and rejected (original) responses.
 * No LLM call needed.
 *
 * @param correction - The enriched correction signal
 * @param reputation - The correcting user's reputation score
 * @returns A preference pair, or null if reputation is too low or prompt is invalid
 */
export function derivePreferencePairFromCorrection(
  correction: CorrectionSignal,
  reputation: ReputationScore,
): PreferencePair | null {
  if (reputation.score < 0.4) {
    return null;
  }

  const { originalQuestion, originalAnswer, correctedAnswer, signal } = correction;

  if (looksLikeUuid(originalQuestion)) {
    return null;
  }

  const confidence = reputation.score >= 0.8 ? 1.0 : 0.6;

  return {
    prompt: originalQuestion,
    chosen: correctedAnswer,
    rejected: originalAnswer,
    metadata: {
      conflictType: 'contradiction',
      resolvedBy: signal.userId,
      resolvedAt: signal.createdAt,
      confidence,
      sourceNodeIds: signal.questionNodeIds,
    },
  };
}
