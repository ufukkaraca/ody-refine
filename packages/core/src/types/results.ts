import type {
  Reserve,
  SourceLifecycleStatus,
  SourcePointer,
  Swap,
} from '../entities/index.js';

/**
 * AnswerSource - a source contributing to an answer
 */
export interface AnswerSource {
  reserveId: string;
  reserve: Pick<Reserve, 'title' | 'content' | 'sourceType' | 'sourceReference'>;
  relevance: number; // 0-1 how much this reserve contributed
  evidence: SourcePointer[]; // original sources within this reserve
  sourceId?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  sourceStatus?: SourceLifecycleStatus;
  lastVerifiedAt?: string | null;
  missingReason?: string | null;
  localEvidenceUrl?: string | null;
}

/**
 * AnswerResult - the result of asking Ody a question
 */
export interface AnswerResult {
  text: string; // the answer text (markdown)
  confidence: number; // 0-1 overall confidence
  confidenceExplanation: string; // short explanation of what drove confidence
  sources: AnswerSource[];
  reserveIds: string[]; // IDs of reserves used
  swapIds: string[]; // IDs of swaps traversed
  swaps: Swap[]; // the actual swaps for UI display
  sourceType?: 'safe' | 'issue' | 'topic' | 'evidence';
  sourceLabel?: string | null;
  sourceId?: string | null;
  verifiedAt?: string | null;
  actionNeeded?: string | null;
}

/**
 * ConversationTurn - a single turn in a conversation
 */
export interface ConversationTurn {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

/**
 * Conversation - a chat session between user and Ody
 */
export interface Conversation {
  id: string;
  userId: string;
  vaultId: string;
  turns: ConversationTurn[];
  createdAt: Date;
}

/**
 * MindViewNode - a reserve represented in the mind graph
 */
export interface MindViewNode {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  type: 'reserve';
}

/**
 * MindViewEdge - a swap represented in the mind graph
 */
export interface MindViewEdge {
  id: string;
  source: string; // reserveId
  target: string; // reserveId
  type: string; // swap type
  reason: string;
  confidence: number;
}

/**
 * MindView - the graph data for mind visualization
 */
export interface MindView {
  nodes: MindViewNode[];
  edges: MindViewEdge[];
  centerNodeId?: string; // if seeded from a specific reserve
}

/**
 * DistillationResult - result of distilling memory from a turn
 */
export interface DistillationResult {
  reservesCreated: string[];
  reservesUpdated: string[];
  swapsCreated: string[];
  swapsUpdated: string[];
}
