/**
 * @ody/platform-core — shared types, SQLite implementations, loader, and providers.
 * @module @ody/platform-core
 */

export * from './types.js';
export { parseLlmJsonResponse } from './parse-llm-json.js';
export * from './sqlite/index.js';
export { runDetection } from './loader.js';
export type { RunDetectionOptions, DetectionResult, DetectorStats } from './loader.js';
export * from './providers/index.js';
