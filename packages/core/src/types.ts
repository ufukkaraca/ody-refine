/**
 * All shared interfaces for the Ody platform.
 * @module types
 */

// --- Knowledge Graph Entities ---

/** A node in the knowledge graph representing a chunk of content. */
export interface KnowledgeNode {
  id: string;
  title: string;
  content: NodeContent;
  embedding: number[];
  embeddingModel: string;
  embeddingDim: number;
  confidence: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Content stored within a knowledge node. */
export interface NodeContent {
  summary: string;
  facts?: string[];
  entities?: NamedEntity[];
  source?: SourceRef;
  raw?: string;
}

/** A named entity extracted from content. */
export interface NamedEntity {
  name: string;
  type: string;
}

/** Reference to the original source of a knowledge node. */
export interface SourceRef {
  sourceType: string;
  sourceId: string;
  url?: string;
  lastModified?: Date;
}

/** An edge connecting two knowledge nodes. */
export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  reason: string;
  confidence: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

/** Types of edges between knowledge nodes. */
export type EdgeType =
  | 'related'
  | 'caused_by'
  | 'depends_on'
  | 'contradicts'
  | 'supersedes'
  | 'mentioned_in';

// --- Detections ---

/** A detection produced by a detector. */
export interface Detection {
  type: DetectionType;
  severity: 'critical' | 'warning' | 'info';
  nodeIds: string[];
  description: string;
  suggestedAction?: string;
  metadata?: Record<string, unknown>;
}

/** Types of issues a detector can find. */
export type DetectionType =
  | 'contradiction'
  | 'duplicate'
  | 'staleness'
  | 'undocumented'
  | 'time_bomb';

// --- Detector Function ---

/** A detector function with pre-filter configuration. */
export type DetectorFn = ((
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  llm?: LLMProvider,
) => Promise<Detection[]>) & {
  preFilter: PreFilterConfig;
};

/** Configuration for pre-filtering candidates before detection. */
export interface PreFilterConfig {
  similarityThreshold: number;
  topK: number;
  requireAllNodes?: boolean;
}

// --- LLM Provider ---

/** A chat message for LLM completion. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options for LLM completion requests. */
export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

/** Provider interface for LLM completions. */
export interface LLMProvider {
  complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): Promise<string>;

  stream(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<string, void, unknown>;

  getModelId(): string;
}

// --- Embedding Provider ---

/** Provider interface for text embeddings. */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getModelId(): string;
  getDimension(): number;
}

// --- Vector Index ---

/** Vector similarity search index. */
export interface VectorIndex {
  add(id: string, embedding: number[]): Promise<void>;
  search(
    query: number[],
    topK: number,
    minSimilarity?: number,
  ): Promise<SearchResult[]>;
  remove(id: string): Promise<void>;
  count(): Promise<number>;
}

/** A single result from a vector similarity search. */
export interface SearchResult {
  id: string;
  distance: number;
}

// --- Repositories ---

/** Filter options for querying knowledge nodes. */
export interface NodeFilter {
  embeddingModel?: string;
  minConfidence?: number;
  since?: Date;
  metadata?: Record<string, unknown>;
}

/** Repository interface for knowledge nodes. */
export interface NodeRepository {
  upsert(node: KnowledgeNode): Promise<void>;
  findById(id: string): Promise<KnowledgeNode | null>;
  findAll(filter?: NodeFilter): Promise<KnowledgeNode[]>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
}

/** Repository interface for knowledge edges. */
export interface EdgeRepository {
  upsert(edge: KnowledgeEdge): Promise<void>;
  findByNodeId(nodeId: string): Promise<KnowledgeEdge[]>;
  findByType(type: EdgeType): Promise<KnowledgeEdge[]>;
  findAll(): Promise<KnowledgeEdge[]>;
  delete(id: string): Promise<void>;
}

// --- Export ---

/** Options for exporting knowledge data. */
export interface ExportOptions {
  format: 'jsonl';
  includeMetadata?: boolean;
  filterByConfidence?: number;
}

/** A preference pair for training data export. */
export interface PreferencePair {
  prompt: string;
  chosen: string;
  rejected: string;
  metadata: {
    conflictType: DetectionType;
    resolvedBy: string;
    resolvedAt: Date;
    confidence: number;
    sourceNodeIds: string[];
  };
}

// --- Parse LLM JSON ---

/** Result of parsing an LLM JSON response. */
export interface ParseLlmJsonResult<T> {
  data: T | null;
  parseMode: 'direct' | 'fenced' | 'embedded' | 'repaired' | null;
  error?: string;
}
