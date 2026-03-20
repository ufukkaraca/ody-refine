/**
 * LLM completion with timeout guard.
 * Returns empty string on transient errors (timeout, 5xx).
 * Re-throws fatal errors (auth, quota) so the caller can surface them.
 * @module helpers/llm-timeout
 */
import type {
  ChatMessage,
  LLMCompletionOptions,
  LLMProvider,
} from '@useody/platform-core';

const DEFAULT_TIMEOUT_MS = 15_000;

/** Check whether an error is an unrecoverable auth/quota failure. */
function isFatalLlmError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'LLMAuthError'
    || err.message.includes('authentication/quota error')
    || err.message.includes('Invalid API key');
}

/**
 * Call LLM with a timeout.
 * Returns empty string on transient failures (timeout, 5xx).
 * Re-throws fatal errors (401, 403) so the scan can fail fast.
 */
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
  } catch (err: unknown) {
    if (isFatalLlmError(err)) throw err;
    return '';
  }
}
