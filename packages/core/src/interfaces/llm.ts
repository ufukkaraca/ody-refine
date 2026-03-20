/**
 * ChatMessage - a message in an LLM conversation
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * LLMCompletionOptions - options for LLM completion
 */
export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

/**
 * LLMProvider - interface for LLM completions
 * Implementations: OpenRouter, Fake
 */
export interface LLMProvider {
  /**
   * Generate a completion for the given messages
   */
  complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<string>;

  /**
   * Stream a completion for the given messages
   */
  stream(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): AsyncGenerator<string, void, unknown>;

  /**
   * Get the model identifier being used
   */
  getModelId(): string;
}

/**
 * EmbeddingProvider - interface for text embeddings
 * Implementations: OpenRouter/OpenAI, Fake
 */
export interface EmbeddingProvider {
  /**
   * Generate embedding for a single text
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batch)
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get the dimension of embeddings produced
   */
  getDimension(): number;
}

/**
 * VectorSearchResult - a single result from vector search
 */
export interface VectorSearchResult {
  id: string;
  score: number; // similarity score
  metadata?: Record<string, unknown>;
}

/**
 * VectorStore - interface for vector similarity search
 * Implementations: pgvector
 */
export interface VectorStore {
  /**
   * Upsert a vector with ID and optional metadata
   */
  upsert(
    id: string,
    vector: number[],
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Search for similar vectors
   */
  search(
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]>;

  /**
   * Delete a vector by ID
   */
  delete(id: string): Promise<void>;
}
