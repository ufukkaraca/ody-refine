/**
 * Feedback package types for interaction signals, reputation, and rewards.
 * @module feedback/types
 */

/** Types of user interaction signals. */
export type SignalType =
  | 'accepted'     // User moved on (implicit positive)
  | 'rejected'     // User rephrased same question
  | 'corrected'    // User said "actually, it's X"
  | 'escalated'    // User @mentioned a human or left
  | 'shared'       // User copied/forwarded the answer
  | 'follow_up'    // User asked a clarifying question
  | 'emoji_positive' // Slack/Teams positive emoji reaction (thumbsup, check, heart)
  | 'emoji_negative' // Slack/Teams negative emoji reaction (thumbsdown, x, confused)
  | 'reply_positive' // Reply with positive sentiment
  | 'reply_negative'; // Reply with negative sentiment

/** A recorded user interaction signal. */
export interface InteractionSignal {
  id: string;
  userId: string;
  conversationId: string;
  turnId: string;
  signalType: SignalType;
  correctionText?: string;
  questionNodeIds: string[];
  timeToActionMs: number;
  reputationWeight: number;
  createdAt: Date;
}

/** A user's reputation score and history. */
export interface ReputationScore {
  userId: string;
  score: number;
  totalSignals: number;
  correctCorrections: number;
  overriddenCorrections: number;
  lastUpdated: Date;
}

/** Derived reward from an interaction signal. */
export interface RewardDerivation {
  signalId: string;
  rewardType: 'positive' | 'negative' | 'neutral';
  weight: number;
  preferencePairGenerated: boolean;
  reason: string;
}

/**
 * A correction signal with the full context needed for preference pair creation.
 * This is the enriched version of an InteractionSignal with type 'corrected'.
 */
export interface CorrectionSignal {
  /** The underlying interaction signal. */
  signal: InteractionSignal;
  /** The original question the user asked. */
  originalQuestion: string;
  /** Colleague's original answer (becomes the rejected response). */
  originalAnswer: string;
  /** The user's corrected answer (becomes the chosen response). */
  correctedAnswer: string;
}

/** Signal weights for reward derivation. */
export const SIGNAL_WEIGHTS: Record<SignalType, { type: 'positive' | 'negative' | 'neutral'; weight: number }> = {
  // Explicit interaction signals
  accepted: { type: 'positive', weight: 0.3 },
  rejected: { type: 'negative', weight: 0.6 },
  corrected: { type: 'negative', weight: 0.9 },
  escalated: { type: 'negative', weight: 0.5 },
  shared: { type: 'positive', weight: 0.8 },
  follow_up: { type: 'neutral', weight: 0.1 },
  // Passive sentiment signals (emoji reactions, reply tone)
  emoji_positive: { type: 'positive', weight: 0.4 },
  emoji_negative: { type: 'negative', weight: 0.5 },
  reply_positive: { type: 'positive', weight: 0.5 },
  reply_negative: { type: 'negative', weight: 0.6 },
};
