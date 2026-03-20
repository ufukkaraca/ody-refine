/**
 * Helper utilities for detectors.
 * @module helpers
 */
export { completeWithTimeout } from './llm-timeout.js';
export {
  normalize,
  tokenize,
  sharedTokens,
  lexicalScore,
  buildSignal,
  STOP_WORDS,
} from './text-utils.js';
