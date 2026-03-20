/**
 * Shared retry logic for connector operations.
 * Dispatches on typed error classes to choose the right strategy.
 * @module connectors/retry
 */
import {
  ConnectorAuthError,
  ConnectorRateLimitError,
  ConnectorTokenExpiredError,
  ConnectorServerError,
} from './types.js';

/** Options for the retry wrapper. */
export interface RetryOptions {
  /** Maximum number of retries (default: 3). */
  maxRetries?: number;
  /** Called before each retry attempt with the error and attempt number. */
  onRetry?: (error: Error, attempt: number) => void;
  /** Token refresh function — called once on ConnectorTokenExpiredError. */
  refreshToken?: () => Promise<void>;
}

/**
 * Execute an async function with automatic retry based on error type.
 *
 * - ConnectorAuthError → fail immediately (no retry)
 * - ConnectorRateLimitError → wait retryAfter seconds, then retry
 * - ConnectorTokenExpiredError → call refreshToken once, then retry
 * - ConnectorServerError → exponential backoff, up to maxRetries
 * - Unknown errors → fail immediately
 */
export async function withConnectorRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  let tokenRefreshed = false;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;

      // Auth errors: never retry
      if (error instanceof ConnectorAuthError) throw error;

      // Rate limit: wait and retry
      if (error instanceof ConnectorRateLimitError) {
        if (attempt >= maxRetries) throw error;
        attempt++;
        options?.onRetry?.(error, attempt);
        const waitMs = Math.min((error.retryAfter ?? 1) * 1000, 60_000);
        await sleep(waitMs);
        continue;
      }

      // Token expired: refresh once, then retry
      if (error instanceof ConnectorTokenExpiredError) {
        if (tokenRefreshed || !error.refreshable || !options?.refreshToken) {
          throw error;
        }
        tokenRefreshed = true;
        options?.onRetry?.(error, 1);
        await options.refreshToken();
        continue;
      }

      // Server error: exponential backoff
      if (error instanceof ConnectorServerError) {
        if (attempt >= maxRetries) throw error;
        attempt++;
        options?.onRetry?.(error, attempt);
        const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 10_000);
        await sleep(backoffMs);
        continue;
      }

      // Any other error: don't retry
      throw error;
    }
  }
}

/** Promise-based sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
