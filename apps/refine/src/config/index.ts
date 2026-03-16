/**
 * Configuration module — schema, loader, and auto-detection.
 * @module config
 */
export { loadConfig } from './loader.js';
export { DEFAULT_CONFIG } from './schema.js';
export type { RefineConfig, EmbeddingConfig, LLMConfig } from './schema.js';
export { detectOllama, detectEmbeddingProvider } from './auto-detect.js';
export type { OllamaDetectionResult } from './auto-detect.js';
