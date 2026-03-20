/**
 * ContextProvider interface — types only.
 * Defines the contract for context packaging strategies used by
 * LLM-augmented detection. Implementations can provide custom
 * context assembly (e.g., graph traversal, API-specific context).
 * @module context-provider
 */
import type { KnowledgeNode, KnowledgeEdge } from './types.js';

/** A structured context package for LLM analysis. */
export interface ContextPackage {
  /** Unique identifier for this context package. */
  id: string;
  /** Topic or entity cluster this package covers. */
  topic: string;
  /** Nodes grouped into this context package. */
  nodes: KnowledgeNode[];
  /** Edges between nodes in this package. */
  edges: KnowledgeEdge[];
  /** Shared entities across nodes in this package. */
  sharedEntities: string[];
  /** Source metadata for authority scoring. */
  sourceMetadata: SourceMeta[];
}

/** Metadata about a source for authority scoring. */
export interface SourceMeta {
  /** Node ID this metadata belongs to. */
  nodeId: string;
  /** Source type (e.g., 'notion', 'slack', 'confluence'). */
  sourceType: string;
  /** Author or owner of the source document. */
  author?: string;
  /** Role of the author (e.g., 'executive', 'engineer', 'bot'). */
  authorRole?: string;
  /** When the source was last modified. */
  lastModified?: Date;
}

/**
 * Interface for providing structured context to LLM-augmented detection.
 * Implementations assemble context packages from the knowledge graph
 * that are optimized for LLM reasoning about contradictions.
 */
export interface ContextProvider {
  /**
   * Build context packages from the knowledge graph.
   * Groups related nodes into packages suitable for LLM analysis.
   */
  buildPackages(
    nodes: KnowledgeNode[],
    edges: KnowledgeEdge[],
  ): Promise<ContextPackage[]>;

  /** Human-readable name for this context provider. */
  readonly name: string;
}
