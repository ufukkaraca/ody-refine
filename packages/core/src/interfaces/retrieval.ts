/**
 * Retrieval Repository Interfaces
 *
 * Defines interfaces for retrieval-related data access, shared between
 * @ody/db (implementations) and @ody/orchestrator (consumers).
 */

/**
 * Minimal swap edge representation for graph traversal
 * Uses the essential fields from the full Swap entity
 */
export interface SwapEdge {
  id: string;
  reserveAId: string;
  reserveBId: string;
  type: string;
  reason: string;
  confidence: number;
}

/**
 * Repository interface for swap traversal data access
 */
export interface SwapTraversalRepository {
  /**
   * Find all swaps connected to given reserve IDs
   */
  findSwapsForReserves(reserveIds: string[]): Promise<SwapEdge[]>;

  /**
   * Get reserve details by IDs
   */
  getReservesByIds(ids: string[]): Promise<
    Array<{
      id: string;
      title: string;
      vaultId: string;
      content: { summary: string; facts: string[] };
      confidence: number;
    }>
  >;
}

/**
 * Term heat score with component breakdown
 */
export interface TermHeatScore {
  term: string;
  termType: 'keyword' | 'entity' | 'topic' | 'concept';
  heat: number; // 0-1 combined score
  components: {
    recency: number;
    frequency: number;
    userImportance: number;
    domainRelevance: number;
  };
}

/**
 * Repository interface for query heat persistence
 */
export interface QueryHeatRepository {
  upsertTermHeat(params: {
    orgId: string;
    vaultId?: string;
    term: string;
    termType?: 'keyword' | 'entity' | 'topic' | 'concept';
  }): Promise<void>;

  getTermHeat(params: {
    orgId: string;
    vaultId?: string;
    limit?: number;
  }): Promise<
    Array<{
      term: string;
      termType: string;
      lastOccurredAt: Date;
      totalOccurrences: number;
      avgUserWeight: number;
      retrievalHitRate: number;
    }>
  >;

  insertQueryLog(params: {
    orgId: string;
    userId: string;
    vaultId?: string;
    queryText: string;
    extractedTerms: string[];
    resultCount: number;
    retrievedReserveIds?: string[];
  }): Promise<string>;

  updateQueryLogFeedback(params: {
    queryLogId: string;
    wasHelpful: boolean;
  }): Promise<void>;

  updateRetrievalHitRate(params: {
    orgId: string;
    terms: string[];
    hitRate: number;
  }): Promise<void>;

  applyDecay(decayRate: number): Promise<number>;
}
