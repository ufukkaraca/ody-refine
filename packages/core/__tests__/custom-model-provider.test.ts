import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the CustomModelProvider by mocking fetch — no real Ollama needed.

describe('CustomModelProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset fetch mock before each test
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('create with named model', () => {
    it('should create provider when model exists in Ollama', async () => {
      const { CustomModelProvider } = await import(
        '../src/providers/custom-model-provider.js'
      );

      // Mock /api/tags to return the model
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'qwen2.5:7b' }],
        }),
      });

      const provider = await CustomModelProvider.create({
        modelNameOrPath: 'qwen2.5:7b',
      });

      expect(provider.getModelId()).toBe('ody-custom/qwen2.5:7b');
    });

    it('should throw when model does not exist', async () => {
      const { CustomModelProvider } = await import(
        '../src/providers/custom-model-provider.js'
      );

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await expect(
        CustomModelProvider.create({ modelNameOrPath: 'nonexistent' }),
      ).rejects.toThrow('not found in Ollama');
    });
  });

  describe('complete', () => {
    it('should call Ollama chat API with correct model name', async () => {
      const { CustomModelProvider } = await import(
        '../src/providers/custom-model-provider.js'
      );

      // First call: /api/tags (model exists)
      // Second call: /api/chat (completion)
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'test-model' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            message: { content: 'Hello from custom model' },
          }),
        });

      const provider = await CustomModelProvider.create({
        modelNameOrPath: 'test-model',
      });

      const result = await provider.complete([
        { role: 'user', content: 'Hi' },
      ]);

      expect(result).toBe('Hello from custom model');

      // Verify the chat API was called with the correct model
      const chatCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(chatCall![0]).toBe('http://localhost:11434/api/chat');
      const body = JSON.parse(chatCall![1].body as string) as { model: string };
      expect(body.model).toBe('test-model');
    });

    it('should throw on non-ok response', async () => {
      const { CustomModelProvider } = await import(
        '../src/providers/custom-model-provider.js'
      );

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'test-model' }] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'internal error',
        });

      const provider = await CustomModelProvider.create({
        modelNameOrPath: 'test-model',
      });

      await expect(
        provider.complete([{ role: 'user', content: 'Hi' }]),
      ).rejects.toThrow('Custom model chat failed (500)');
    });
  });

  describe('fromLoraAdapter', () => {
    it('should register a LoRA adapter via Ollama create API', async () => {
      const { CustomModelProvider } = await import(
        '../src/providers/custom-model-provider.js'
      );

      // /api/tags — model does not exist yet
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [] }),
        })
        // /api/create — register the LoRA adapter
        .mockResolvedValueOnce({ ok: true });

      const logger = vi.fn();
      const provider = await CustomModelProvider.fromLoraAdapter({
        baseModel: 'qwen2.5:7b',
        adapterPath: '/models/acme/lora-weights',
        modelId: 'org-acme-v3',
        logger,
      });

      expect(provider.getModelId()).toBe('ody-custom/ody-lora-org-acme-v3');

      // Verify the create API was called with a Modelfile that includes ADAPTER
      const createCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(createCall![0]).toBe('http://localhost:11434/api/create');
      const body = JSON.parse(createCall![1].body as string) as {
        name: string; modelfile: string;
      };
      expect(body.name).toBe('ody-lora-org-acme-v3');
      expect(body.modelfile).toContain('FROM qwen2.5:7b');
      expect(body.modelfile).toContain('ADAPTER /models/acme/lora-weights');

      // Verify logger was called
      expect(logger).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('Registering LoRA adapter'),
      );
    });

    it('should skip import if LoRA model already exists in Ollama', async () => {
      const { CustomModelProvider } = await import(
        '../src/providers/custom-model-provider.js'
      );

      // /api/tags — model already exists
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'ody-lora-org-acme-v3' }],
        }),
      });

      const provider = await CustomModelProvider.fromLoraAdapter({
        baseModel: 'qwen2.5:7b',
        adapterPath: '/models/acme/lora-weights',
        modelId: 'org-acme-v3',
      });

      expect(provider.getModelId()).toBe('ody-custom/ody-lora-org-acme-v3');
      // Only one fetch call (tags check) — no create call
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw if Ollama create fails for LoRA adapter', async () => {
      const { CustomModelProvider } = await import(
        '../src/providers/custom-model-provider.js'
      );

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => 'bad adapter format',
        });

      await expect(
        CustomModelProvider.fromLoraAdapter({
          baseModel: 'qwen2.5:7b',
          adapterPath: '/bad/path',
          modelId: 'bad-model',
        }),
      ).rejects.toThrow('Failed to register LoRA adapter');
    });
  });
});
