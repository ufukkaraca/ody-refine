import type { EvidenceRef } from './base.js';

/**
 * SwapType - the kind of relationship between two reserves
 */
export type SwapType =
  | 'related' // general semantic relationship
  | 'caused_by' // A was caused by B
  | 'depends_on' // A depends on B
  | 'contradicts' // A contradicts B
  | 'supersedes' // A replaces/updates B
  | 'person_knows' // person reserve linked to topic they know about
  | 'mentioned_in' // entity mentioned in another reserve
  | 'discussed_with' // pages discussed together in comments
  | 'collaboratively_edited'; // pages edited within temporal proximity

/**
 * Swap entity - typed edge between two reserves with reason and confidence
 * Note: type accepts string for DB compatibility (validated at runtime)
 */
export interface Swap {
  id: string;
  reserveAId: string;
  reserveBId: string;
  type: SwapType | string;
  reason: string; // 1-sentence explanation of the relationship
  confidence: number; // 0-1 confidence in this connection
  evidence: EvidenceRef[];
  createdBy: 'ody' | 'user';
  createdAt: Date;
}

/**
 * Safe entity - static export generated from reserves
 */
export interface Safe {
  id: string;
  vaultId: string;
  title: string;
  content: string; // synthesized document content (markdown)
  sourceReserveIds: string[]; // reserves used to generate this safe
  sourceSwapIds: string[]; // swaps traversed during generation
  synthesisPrompt?: string; // user-provided focus for generation
  updateMode: 'on_demand' | 'auto';
  version: number; // version number, incremented on refresh
  createdAt: Date;
  refreshedAt: Date;
}

/**
 * ReputationTopic - confidence score for a user on a specific topic
 */
export interface ReputationTopic {
  topic: string;
  confidence: number; // 0-1
  evidenceCount: number;
  contradictionCount: number;
  lastUpdated: Date;
}

/**
 * Reputation entity - tracks user reliability per topic
 */
export interface Reputation {
  userId: string;
  topics: ReputationTopic[];
  overallConfidence: number; // weighted average
}
