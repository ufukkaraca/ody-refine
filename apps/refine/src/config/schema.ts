/**
 * Configuration schema for ody-refine CLI.
 * @module config/schema
 */

/** Embedding provider configuration. */
export interface EmbeddingConfig {
  provider: 'ollama' | 'openai' | 'cohere';
  model: string;
  apiKey: string;
}

/** LLM provider configuration. */
export interface LLMConfig {
  provider:
    | 'ollama' | 'openai' | 'anthropic' | 'openrouter'
    | 'groq' | 'xai' | 'gemini';
  model: string;
  apiKey: string;
}

/** Ollama-specific configuration. */
export interface OllamaConfig {
  baseUrl: string;
}

/** Database configuration. */
export interface DatabaseConfig {
  type: 'sqlite';
}

/** Complete Refine CLI configuration. */
export interface RefineConfig {
  embedding: EmbeddingConfig;
  llm: LLMConfig;
  ollama: OllamaConfig;
  database: DatabaseConfig;
  dataDir: string;
}

/** Default configuration values. Uses Ollama for zero-trust local-first defaults. */
export const DEFAULT_CONFIG: RefineConfig = {
  embedding: { provider: 'ollama', model: 'nomic-embed-text', apiKey: '' },
  llm: { provider: 'ollama', model: 'qwen2.5:7b', apiKey: '' },
  ollama: { baseUrl: 'http://localhost:11434' },
  database: { type: 'sqlite' },
  dataDir: '.ody-refine',
};
