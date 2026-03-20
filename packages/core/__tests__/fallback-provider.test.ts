import { describe, it, expect, vi } from 'vitest';
import { FallbackProvider } from '../src/providers/fallback-provider.js';
import type { FallbackLog } from '../src/providers/fallback-provider.js';
import type { LLMProvider, ChatMessage, LLMCompletionOptions } from '../src/types.js';

function makeMockProvider(
  modelId: string,
  response: string,
): LLMProvider {
  return {
    getModelId: () => modelId,
    complete: vi.fn(async () => response),
    async *stream() { yield response; },
  };
}

function makeFailingProvider(
  modelId: string,
  error: string,
): LLMProvider {
  return {
    getModelId: () => modelId,
    complete: vi.fn(async () => { throw new Error(error); }),
    async *stream() { throw new Error(error); },
  };
}

const testMessages: ChatMessage[] = [
  { role: 'user', content: 'Hello' },
];

describe('FallbackProvider', () => {
  describe('constructor', () => {
    it('should throw if no providers are given', () => {
      expect(() => new FallbackProvider({ providers: [] })).toThrow(
        'FallbackProvider requires at least one provider',
      );
    });
  });

  describe('complete', () => {
    it('should use the first provider when it succeeds', async () => {
      const primary = makeMockProvider('custom/v1', 'custom answer');
      const fallback = makeMockProvider('ollama/llama3', 'base answer');
      const provider = new FallbackProvider({
        providers: [primary, fallback],
      });

      const result = await provider.complete(testMessages);

      expect(result).toBe('custom answer');
      expect(primary.complete).toHaveBeenCalledOnce();
      expect(fallback.complete).not.toHaveBeenCalled();
      expect(provider.getLastUsedModelId()).toBe('custom/v1');
    });

    it('should fall back to second provider on first failure', async () => {
      const primary = makeFailingProvider('custom/v1', 'model not loaded');
      const fallback = makeMockProvider('ollama/llama3', 'base answer');
      const provider = new FallbackProvider({
        providers: [primary, fallback],
      });

      const result = await provider.complete(testMessages);

      expect(result).toBe('base answer');
      expect(primary.complete).toHaveBeenCalledOnce();
      expect(fallback.complete).toHaveBeenCalledOnce();
      expect(provider.getLastUsedModelId()).toBe('ollama/llama3');
    });

    it('should throw when all providers fail', async () => {
      const p1 = makeFailingProvider('custom/v1', 'error 1');
      const p2 = makeFailingProvider('ollama/llama3', 'error 2');
      const provider = new FallbackProvider({ providers: [p1, p2] });

      await expect(provider.complete(testMessages)).rejects.toThrow(
        'All providers failed',
      );
    });

    it('should pass options through to providers', async () => {
      const primary = makeMockProvider('custom/v1', 'answer');
      const provider = new FallbackProvider({
        providers: [primary],
      });
      const opts: LLMCompletionOptions = { temperature: 0.5, maxTokens: 100 };

      await provider.complete(testMessages, opts);

      expect(primary.complete).toHaveBeenCalledWith(testMessages, opts);
    });

    it('should try third provider when first two fail', async () => {
      const p1 = makeFailingProvider('custom/v1', 'no adapter');
      const p2 = makeFailingProvider('ollama/llama3', 'not running');
      const p3 = makeMockProvider('openrouter/gpt4', 'cloud answer');
      const provider = new FallbackProvider({
        providers: [p1, p2, p3],
      });

      const result = await provider.complete(testMessages);

      expect(result).toBe('cloud answer');
      expect(provider.getLastUsedModelId()).toBe('openrouter/gpt4');
    });
  });

  describe('stream', () => {
    it('should stream from the first successful provider', async () => {
      const primary = makeMockProvider('custom/v1', 'streamed');
      const provider = new FallbackProvider({
        providers: [primary],
      });

      const chunks: string[] = [];
      for await (const chunk of provider.stream(testMessages)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['streamed']);
    });

    it('should fall back on stream failure', async () => {
      const primary = makeFailingProvider('custom/v1', 'stream error');
      const fallback = makeMockProvider('ollama/llama3', 'fallback stream');
      const provider = new FallbackProvider({
        providers: [primary, fallback],
      });

      const chunks: string[] = [];
      for await (const chunk of provider.stream(testMessages)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['fallback stream']);
    });
  });

  describe('logging', () => {
    it('should record attempt logs', async () => {
      const primary = makeFailingProvider('custom/v1', 'oops');
      const fallback = makeMockProvider('ollama/llama3', 'ok');
      const provider = new FallbackProvider({
        providers: [primary, fallback],
      });

      await provider.complete(testMessages);

      const logs = provider.getAttemptLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0]!.modelId).toBe('custom/v1');
      expect(logs[0]!.success).toBe(false);
      expect(logs[0]!.error).toBe('oops');
      expect(logs[1]!.modelId).toBe('ollama/llama3');
      expect(logs[1]!.success).toBe(true);
    });

    it('should call onAttempt callback', async () => {
      const onAttempt = vi.fn();
      const primary = makeMockProvider('custom/v1', 'answer');
      const provider = new FallbackProvider({
        providers: [primary],
        onAttempt,
      });

      await provider.complete(testMessages);

      expect(onAttempt).toHaveBeenCalledOnce();
      const log: FallbackLog = onAttempt.mock.calls[0]![0];
      expect(log.modelId).toBe('custom/v1');
      expect(log.success).toBe(true);
      expect(log.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should log warnings via logger on failure', async () => {
      const logger = vi.fn();
      const primary = makeFailingProvider('custom/v1', 'broken');
      const fallback = makeMockProvider('ollama/llama3', 'ok');
      const provider = new FallbackProvider({
        providers: [primary, fallback],
        logger,
      });

      await provider.complete(testMessages);

      expect(logger).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('custom/v1 failed'),
      );
    });
  });

  describe('getModelId', () => {
    it('should return primary model ID before any calls', () => {
      const primary = makeMockProvider('custom/v1', 'answer');
      const provider = new FallbackProvider({
        providers: [primary],
      });

      expect(provider.getModelId()).toBe('custom/v1');
    });

    it('should return last used model ID after a call', async () => {
      const primary = makeFailingProvider('custom/v1', 'err');
      const fallback = makeMockProvider('ollama/llama3', 'ok');
      const provider = new FallbackProvider({
        providers: [primary, fallback],
      });

      await provider.complete(testMessages);

      expect(provider.getModelId()).toBe('ollama/llama3');
    });
  });
});
