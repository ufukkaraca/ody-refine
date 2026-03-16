import type { ChatMessage, LLMCompletionOptions, LLMProvider } from './llm.js';

/**
 * Task types for tiered model selection
 * Each task type maps to a model optimized for that specific use case
 */
export type TaskType =
  | 'routing'     // Fast: Query classification, intent detection
  | 'extraction'  // Fast: Entity/keyword extraction
  | 'reranking'   // Quality: Result relevance scoring
  | 'synthesis'   // Quality: Answer generation
  | 'planning';   // Quality: Query decomposition, multi-hop planning

/**
 * Configuration for model tiers
 */
export interface ModelTierConfig {
  routing: string;
  extraction: string;
  reranking: string;
  synthesis: string;
  planning: string;
}

/**
 * Default latency targets per task type (in ms)
 */
export const LATENCY_TARGETS: Record<TaskType, number> = {
  routing: 500,
  extraction: 800,
  reranking: 1000,
  synthesis: 2000,
  planning: 1500,
};

/**
 * TieredLLMProvider - LLM provider that routes requests to appropriate models
 * based on task type for optimal latency/quality tradeoff
 */
export interface TieredLLMProvider {
  /**
   * Generate a completion using the model appropriate for the task type
   */
  complete(
    taskType: TaskType,
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<string>;

  /**
   * Stream a completion using the model appropriate for the task type
   */
  stream(
    taskType: TaskType,
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): AsyncGenerator<string, void, unknown>;

  /**
   * Get the model ID for a specific task type
   */
  getModelId(taskType: TaskType): string;

  /**
   * Get the underlying LLM provider for a specific task type
   * Useful for passing to components that need a standard LLMProvider
   */
  getProviderForTask(taskType: TaskType): LLMProvider;
}
