import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildModelfile,
  pushToOllama,
  OllamaPushError,
  DEFAULT_OLLAMA_URL,
} from '../src/ollama-push.js';
import type { ModelArtifact } from '../src/types.js';

/** Stub fs/promises so access() doesn't hit the real filesystem. */
vi.mock('node:fs/promises', () => ({
  access: vi.fn(async () => undefined),
}));

/** Helper to build a test artifact. */
function makeArtifact(overrides: Partial<ModelArtifact> = {}): ModelArtifact {
  return {
    path: '/models/acme/output',
    format: 'gguf',
    baseModel: 'qwen2.5:7b',
    sizeBytes: 4_000_000_000,
    ...overrides,
  };
}

describe('ollama-push', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('buildModelfile', () => {
    it('generates FROM <path> for GGUF artifacts', () => {
      const artifact = makeArtifact({
        path: '/models/acme/model.gguf',
        format: 'gguf',
      });

      const result = buildModelfile(artifact);

      expect(result).toBe('FROM /models/acme/model.gguf\n');
    });

    it('generates FROM <base> + ADAPTER for LoRA artifacts', () => {
      const artifact = makeArtifact({
        path: '/models/acme/lora-adapter',
        format: 'lora',
        baseModel: 'llama3.2:3b',
      });

      const result = buildModelfile(artifact);

      expect(result).toContain('FROM llama3.2:3b');
      expect(result).toContain('ADAPTER /models/acme/lora-adapter');
    });

    it('generates FROM <base> + ADAPTER for safetensors artifacts', () => {
      const artifact = makeArtifact({
        path: '/models/acme/safetensors-dir',
        format: 'safetensors',
        baseModel: 'qwen2.5:7b',
      });

      const result = buildModelfile(artifact);

      expect(result).toContain('FROM qwen2.5:7b');
      expect(result).toContain('ADAPTER /models/acme/safetensors-dir');
    });

    it('includes SYSTEM directive when systemPrompt is provided', () => {
      const artifact = makeArtifact({ format: 'gguf' });
      const result = buildModelfile(artifact, 'You are a helpful assistant.');

      expect(result).toContain('SYSTEM """You are a helpful assistant."""');
    });

    it('omits SYSTEM directive when no systemPrompt is provided', () => {
      const artifact = makeArtifact({ format: 'gguf' });
      const result = buildModelfile(artifact);

      expect(result).not.toContain('SYSTEM');
    });
  });

  describe('pushToOllama', () => {
    it('sends correct payload to Ollama create endpoint', async () => {
      const mockFetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(
        async () => new Response('{"status":"success"}', { status: 200 }),
      );
      globalThis.fetch = mockFetch;

      const artifact = makeArtifact({
        path: '/models/acme/model.gguf',
        format: 'gguf',
      });

      const result = await pushToOllama(artifact, { tag: 'my-model:v1' });

      expect(result.tag).toBe('my-model:v1');
      expect(result.modelfile).toContain('FROM /models/acme/model.gguf');
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${DEFAULT_OLLAMA_URL}/api/create`);
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body['model']).toBe('my-model:v1');
      expect(body['stream']).toBe(false);
    });

    it('uses default tag ody-custom:latest when none specified', async () => {
      globalThis.fetch = vi.fn(
        async () => new Response('{}', { status: 200 }),
      );

      const artifact = makeArtifact({ format: 'gguf' });
      const result = await pushToOllama(artifact);

      expect(result.tag).toBe('ody-custom:latest');
    });

    it('uses custom baseUrl when provided', async () => {
      const mockFetch = vi.fn(
        async () => new Response('{}', { status: 200 }),
      );
      globalThis.fetch = mockFetch;

      const artifact = makeArtifact({ format: 'gguf' });
      await pushToOllama(artifact, { baseUrl: 'http://gpu:11434' });

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://gpu:11434/api/create');
    });

    it('strips trailing slashes from baseUrl', async () => {
      const mockFetch = vi.fn(
        async () => new Response('{}', { status: 200 }),
      );
      globalThis.fetch = mockFetch;

      const artifact = makeArtifact({ format: 'gguf' });
      await pushToOllama(artifact, { baseUrl: 'http://gpu:11434/' });

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://gpu:11434/api/create');
    });

    it('throws OllamaPushError when artifact path does not exist', async () => {
      const { access } = await import('node:fs/promises');
      (access as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('ENOENT'),
      );

      const artifact = makeArtifact({ path: '/nonexistent/model.gguf' });

      await expect(pushToOllama(artifact)).rejects.toThrow(OllamaPushError);
      await expect(pushToOllama(artifact)).rejects.toThrow(
        'Artifact path not found',
      );

      // Restore default mock behavior for subsequent tests
      (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    it('throws OllamaPushError when Ollama is unreachable', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      });

      const artifact = makeArtifact({ format: 'gguf' });

      await expect(pushToOllama(artifact)).rejects.toThrow(OllamaPushError);
      await expect(pushToOllama(artifact)).rejects.toThrow(
        'Failed to connect to Ollama',
      );
    });

    it('throws OllamaPushError when Ollama returns an error status', async () => {
      globalThis.fetch = vi.fn(
        async () => new Response('model not found', { status: 404 }),
      );

      const artifact = makeArtifact({ format: 'gguf' });

      await expect(pushToOllama(artifact)).rejects.toThrow(OllamaPushError);
      await expect(pushToOllama(artifact)).rejects.toThrow('HTTP 404');
    });

    it('calls logger with info messages during push', async () => {
      globalThis.fetch = vi.fn(
        async () => new Response('{}', { status: 200 }),
      );

      const logger = vi.fn();
      const artifact = makeArtifact({ format: 'lora' });

      await pushToOllama(artifact, { logger });

      expect(logger).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('Creating Ollama model'),
      );
      expect(logger).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('registered in Ollama'),
      );
    });
  });
});
