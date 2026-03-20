import { describe, it, expect, vi } from 'vitest';
import { completeWithTimeout } from '../src/helpers/llm-timeout.js';
import type { LLMProvider, ChatMessage } from '@useody/platform-core';

const msgs: ChatMessage[] = [{ role: 'user', content: 'hello' }];

function mockProvider(response: string): LLMProvider {
  return {
    getModelId: () => 'test/model',
    complete: vi.fn(async () => response),
    async *stream() { yield response; },
  };
}

function failingProvider(error: Error): LLMProvider {
  return {
    getModelId: () => 'test/model',
    complete: vi.fn(async () => { throw error; }),
    async *stream() { throw error; },
  };
}

describe('completeWithTimeout', () => {
  it('returns LLM response on success', async () => {
    const result = await completeWithTimeout(mockProvider('ok'), msgs, {});
    expect(result).toBe('ok');
  });

  it('returns empty string on timeout', async () => {
    const slowProvider: LLMProvider = {
      getModelId: () => 'test/model',
      complete: vi.fn(() => new Promise((r) => setTimeout(() => r('late'), 5000))),
      async *stream() { yield ''; },
    };
    const result = await completeWithTimeout(slowProvider, msgs, {}, 50);
    expect(result).toBe('');
  });

  it('returns empty string on transient errors', async () => {
    const err = new Error('openrouter service error (500). Temporarily unavailable');
    const result = await completeWithTimeout(failingProvider(err), msgs, {});
    expect(result).toBe('');
  });

  it('re-throws LLMAuthError (401/403)', async () => {
    const err = new Error('openrouter authentication/quota error (401): Invalid API key');
    err.name = 'LLMAuthError';
    await expect(
      completeWithTimeout(failingProvider(err), msgs, {}),
    ).rejects.toThrow(/authentication\/quota error/);
  });

  it('re-throws errors with "Invalid API key" message', async () => {
    const err = new Error('Invalid API key. Check your OPENROUTER_API_KEY.');
    await expect(
      completeWithTimeout(failingProvider(err), msgs, {}),
    ).rejects.toThrow(/Invalid API key/);
  });
});
