/**
 * SubAgent - specialized agent for a specific topic within a vault
 */
export interface SubAgent {
  id: string;
  vaultId: string;
  topic: string;
  description: string | null;
  expertise: number; // 0-1 confidence in this topic
  reserveIds: string[] | null; // Reserves this agent "owns"
  discoveryLog: DiscoveryEvent[] | null;
  isActive: boolean;
  lastActive: Date;
  createdAt: Date;
}

/**
 * Discovery event types
 */
export type DiscoveryType =
  | 'created_reserve'
  | 'linked_reserves'
  | 'resolved_question'
  | 'found_contradiction'
  | 'learned_topic';

/**
 * DiscoveryEvent - logged when SubAgent learns something
 * Note: timestamp is string for JSON serialization in DB
 */
export interface DiscoveryEvent {
  timestamp: string;
  type: DiscoveryType;
  details: {
    reserveIds?: string[];
    swapId?: string;
    questionId?: string;
    topic?: string;
    summary?: string;
  };
}

/**
 * KnowledgeGap - a question Ody couldn't answer
 */
export interface KnowledgeGap {
  id: string;
  vaultId: string;
  question: string;
  topic: string | null;
  askedBy: string | null;
  conversationId: string | null;
  confidence: number | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionReserveId: string | null;
  notificationSent: boolean | null;
  createdAt: Date;
}

/**
 * Background task status
 */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * BackgroundTask - async operation tracked in DB
 */
export interface BackgroundTask<T = unknown, R = unknown> {
  id: string;
  type: string;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high' | 'critical';
  payload: T;
  result?: R;
  error?: string;
  attempts: number;
  maxAttempts: number;
  scheduledFor?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

/**
 * ExpertConsultation - when Ody defers to a human expert
 */
export interface ExpertConsultation {
  id: string;
  vaultId: string;
  question: string;
  expertId: string;
  requestedBy: string;
  taskId?: string;
  status: 'pending' | 'answered' | 'declined' | 'expired';
  response?: string;
  respondedAt?: Date;
  createdAt: Date;
}

/**
 * Expert - a user recognized for topic expertise
 */
export interface Expert {
  userId: string;
  name: string;
  topics: ExpertTopic[];
  overallScore: number;
}

/**
 * ExpertTopic - expertise in a specific topic
 */
export interface ExpertTopic {
  topic: string;
  confidence: number;
  evidenceCount: number;
  lastDemonstrated: Date;
}
