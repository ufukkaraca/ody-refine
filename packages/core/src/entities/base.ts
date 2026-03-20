/**
 * User entity - represents a person using Ody
 */
export interface User {
  id: string;
  orgId?: string; // Organization the user belongs to
  email: string;
  name: string;
  avatarUrl?: string;
  role: "admin" | "member" | "guest";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Vault type - team vault (shared), personal vault (per-user), or project vault
 */
export type VaultType = "org" | "team" | "personal" | "project";

/**
 * Vault entity - top-level knowledge container with access control
 */
export interface Vault {
  id: string;
  orgId?: string;
  name: string;
  type: VaultType;
  ownerId: string; // userId for personal, orgId for team
  description?: string;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * SourceType - valid source types for evidence
 */
export type SourceType = "conversation" | "slack" | "document" | "manual" | "notion" | "gmail";

export type SourceLifecycleStatus =
  | "active"
  | "moved"
  | "deleted"
  | "access_revoked"
  | "unresolved";

/**
 * SourcePointer - reference to where information came from
 * Note: type accepts string for DB/JSON compatibility (validated at runtime)
 */
export interface SourcePointer {
  type: SourceType | string;
  id: string; // conversationId, slackMessageTs, documentId
  timestamp: Date | string;
  permalink?: string; // for Slack messages, document URLs
  excerpt?: string; // short snippet of the source content
  status?: SourceLifecycleStatus;
  lastVerifiedAt?: Date | string;
  missingReason?: string;
}

/**
 * EvidenceRef - a piece of evidence supporting a reserve's content
 * Note: dates accept string for JSON serialization from DB
 */
export interface EvidenceRef {
  source: SourcePointer;
  relevance: number; // 0-1 how relevant this evidence is
  addedAt: Date | string;
  addedBy?: string; // userId who provided this evidence
}

/**
 * ReserveContent - the evolving knowledge stored in a reserve
 */
export interface ReserveContent {
  summary: string; // current synthesized understanding
  facts: string[]; // extracted factual claims
  entities: string[]; // people, projects, tools mentioned
  lastUpdated: string;
  sourceLifecycle?: {
    sourceId?: string;
    sourceLabel?: string;
    sourceUrl?: string;
    sourceStatus?: SourceLifecycleStatus;
    lastVerifiedAt?: string;
    missingReason?: string;
  };
  notionMetadata?: {
    pageId?: string;
    parentId?: string;
    lastEditedTime?: string;
    createdTime?: string;
    hasComments?: boolean;
    deletedInNotionAt?: string;
    lastPushedAt?: string;
    sourceState?: SourceLifecycleStatus;
  };
  graphMetrics?: {
    degree?: number;
    isHub?: boolean;
    calculatedAt?: string;
  };
  [key: string]: unknown; // Allow additional metadata
}

/**
 * Reserve entity - evolving knowledge node within a vault
 * Note: Uses null | undefined for nullable fields to match DB types
 */
export interface Reserve {
  id: string;
  orgId: string | null | undefined;
  vaultId: string;
  contributorId: string | null | undefined;
  reserveType: string | null | undefined;
  title: string;
  topic?: string | null;
  bodyJson: Record<string, unknown> | null | undefined;
  sourceType: SourcePointer["type"] | null | undefined;
  sourceReference: string | null | undefined;
  content: ReserveContent;
  evidence: EvidenceRef[];
  confidence: number; // 0-1 overall confidence in this knowledge
  embedding?: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}
