/**
 * Tests for the shared connector retry logic.
 * Deterministic tests — no real timing, uses vi.useFakeTimers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withConnectorRetry } from '../src/connectors/retry.js';
import {
  ConnectorAuthError,
  ConnectorRateLimitError,
  ConnectorTokenExpiredError,
  ConnectorServerError,
  ConnectorError,
} from '../src/connectors/types.js';

describe('withConnectorRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on success', async () => {
    const result = await withConnectorRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  describe('ConnectorAuthError', () => {
    it('fails immediately without retry', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn().mockRejectedValue(
        new ConnectorAuthError('notion', 'bad token'),
      );

      await expect(
        withConnectorRetry(fn, { onRetry }),
      ).rejects.toThrow(ConnectorAuthError);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  describe('ConnectorRateLimitError', () => {
    it('waits retryAfter seconds then retries', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new ConnectorRateLimitError('notion', 2))
        .mockResolvedValue('ok');
      const onRetry = vi.fn();

      const promise = withConnectorRetry(fn, { onRetry });
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(ConnectorRateLimitError), 1);
    });

    it('defaults to 1s wait when retryAfter is undefined', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new ConnectorRateLimitError('slack'))
        .mockResolvedValue('ok');

      const promise = withConnectorRetry(fn);
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('gives up after maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(
        new ConnectorRateLimitError('notion', 1),
      );

      const promise = withConnectorRetry(fn, { maxRetries: 2 })
        .catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBeInstanceOf(ConnectorRateLimitError);
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('ConnectorTokenExpiredError', () => {
    it('refreshes token and retries once', async () => {
      const refreshToken = vi.fn().mockResolvedValue(undefined);
      const fn = vi.fn()
        .mockRejectedValueOnce(new ConnectorTokenExpiredError('gmail', true))
        .mockResolvedValue('refreshed');

      const result = await withConnectorRetry(fn, { refreshToken });

      expect(result).toBe('refreshed');
      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('fails if not refreshable', async () => {
      const refreshToken = vi.fn();
      const fn = vi.fn().mockRejectedValue(
        new ConnectorTokenExpiredError('slack', false),
      );

      await expect(
        withConnectorRetry(fn, { refreshToken }),
      ).rejects.toThrow(ConnectorTokenExpiredError);
      expect(refreshToken).not.toHaveBeenCalled();
    });

    it('fails if no refreshToken callback provided', async () => {
      const fn = vi.fn().mockRejectedValue(
        new ConnectorTokenExpiredError('notion', true),
      );

      await expect(
        withConnectorRetry(fn),
      ).rejects.toThrow(ConnectorTokenExpiredError);
    });

    it('does not refresh twice', async () => {
      const refreshToken = vi.fn().mockResolvedValue(undefined);
      const fn = vi.fn()
        .mockRejectedValueOnce(new ConnectorTokenExpiredError('gmail', true))
        .mockRejectedValueOnce(new ConnectorTokenExpiredError('gmail', true));

      await expect(
        withConnectorRetry(fn, { refreshToken }),
      ).rejects.toThrow(ConnectorTokenExpiredError);
      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('ConnectorServerError', () => {
    it('retries with exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new ConnectorServerError('jira', 502))
        .mockRejectedValueOnce(new ConnectorServerError('jira', 503))
        .mockResolvedValue('recovered');
      const onRetry = vi.fn();

      const promise = withConnectorRetry(fn, { onRetry });
      // 1st retry: 1s backoff
      await vi.advanceTimersByTimeAsync(1000);
      // 2nd retry: 2s backoff
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('gives up after maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(
        new ConnectorServerError('confluence', 500),
      );

      const promise = withConnectorRetry(fn, { maxRetries: 1 })
        .catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBeInstanceOf(ConnectorServerError);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('unknown errors', () => {
    it('fails immediately for generic ConnectorError', async () => {
      const fn = vi.fn().mockRejectedValue(
        new ConnectorError('notion', 'fetch', 'something went wrong'),
      );

      await expect(withConnectorRetry(fn)).rejects.toThrow(ConnectorError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('fails immediately for non-Error', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      await expect(withConnectorRetry(fn)).rejects.toBe('string error');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
