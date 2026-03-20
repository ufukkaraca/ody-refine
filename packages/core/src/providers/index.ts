/**
 * Provider implementations barrel export.
 * @module providers
 */
export { OllamaLLMProvider } from './ollama-llm.js';
export type { OllamaLLMConfig } from './ollama-llm.js';
export { OllamaEmbeddingProvider } from './ollama-embedding.js';
export type { OllamaEmbeddingConfig } from './ollama-embedding.js';
export { OpenAIEmbeddingProvider } from './openai-embedding.js';
export type { OpenAIEmbeddingConfig } from './openai-embedding.js';
export { CohereEmbeddingProvider } from './cohere-embedding.js';
export type { CohereEmbeddingConfig } from './cohere-embedding.js';
export {
  TransformersEmbeddingProvider,
  isTransformersAvailable,
} from './transformers-embedding.js';
export type { TransformersEmbeddingConfig } from './transformers-embedding.js';
export { MlxLLMProvider, isMlxAvailable } from './mlx-llm.js';
export type { MlxLLMConfig } from './mlx-llm.js';
export { OpenAICompatibleLLMProvider, LLMAuthError } from './openai-compatible-llm.js';
export type { OpenAICompatibleConfig } from './openai-compatible-llm.js';
export { AnthropicLLMProvider } from './anthropic-llm.js';
export type { AnthropicLLMConfig } from './anthropic-llm.js';
export {
  createLlmProvider,
  OPENAI_COMPATIBLE_PRESETS,
  ANTHROPIC_PRESET,
  PROVIDER_DETECTION_ORDER,
} from './provider-presets.js';
export type { ProviderPreset, ProviderName } from './provider-presets.js';
export { CustomModelProvider } from './custom-model-provider.js';
export type {
  CustomModelConfig,
  LoraAdapterConfig,
  ForgeArtifactMeta,
} from './custom-model-provider.js';
export { FallbackProvider } from './fallback-provider.js';
export type { FallbackProviderConfig, FallbackLog } from './fallback-provider.js';
