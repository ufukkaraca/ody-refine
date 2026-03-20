import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OpenAICompatibleLLMProvider,
  LLMAuthError,
} from '../src/providers/openai-compatible-llm.js';

const BASE_CONFIG = {
  apiKey: 'test-key',
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'test/model',
  providerName: 'openrouter',
  timeoutMs: 5000,
};

describe('OpenAICompatibleLLMProvider error handling', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws LLMAuthError on 401', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Unauthorized', { status: 401 }),
    );
    const provider = new OpenAICompatibleLLMProvider(BASE_CONFIG);
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(LLMAuthError);
  });

  it('throws LLMAuthError on 403', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Forbidden', { status: 403 }),
    );
    const provider = new OpenAICompatibleLLMProvider(BASE_CONFIG);
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(LLMAuthError);
  });

  it('provides helpful message on 429 rate limit', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Too many requests', { status: 429 }),
    );
    const provider = new OpenAICompatibleLLMProvider(BASE_CONFIG);
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/rate limit/i);
  });

  it('provides helpful message on 500 server error', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Internal Server Error', { status: 500 }),
    );
    const provider = new OpenAICompatibleLLMProvider(BASE_CONFIG);
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/service error.*temporarily unavailable/i);
  });

  it('provides helpful message on 503 service unavailable', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Service Unavailable', { status: 503 }),
    );
    const provider = new OpenAICompatibleLLMProvider(BASE_CONFIG);
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/service error.*temporarily unavailable/i);
  });

  it('includes API key hint in 401 message', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Unauthorized', { status: 401 }),
    );
    const provider = new OpenAICompatibleLLMProvider(BASE_CONFIG);
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/API key/i);
  });

  it('throws same errors on stream', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Unauthorized', { status: 401 }),
    );
    const provider = new OpenAICompatibleLLMProvider(BASE_CONFIG);
    const stream = provider.stream([{ role: 'user', content: 'hi' }]);
    await expect(stream.next()).rejects.toThrow(LLMAuthError);
  });
});
