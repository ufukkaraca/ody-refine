/**
 * LLM completion with timeout guard.
 * Returns empty string on timeout or error.
 * @module helpers/llm-timeout
 */
import type {
  ChatMessage,
  LLMCompletionOptions,
  LLMProvider,
} from '@useody/platform-core';

const DEFAULT_TIMEOUT_MS = 3_000;

/** Call LLM with a timeout. Returns empty string on failure. */
export async function completeWithTimeout(
  llm: LLMProvider,
  messages: ChatMessage[],
  options: LLMCompletionOptions,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  try {
    return await Promise.race([
      llm.complete(messages, options),
      new Promise<string>((_, reject) => {
        setTimeout(
          () => reject(new Error('LLM request timed out')),
          timeoutMs,
        );
      }),
    ]);
  } catch {
    return '';
  }
}
