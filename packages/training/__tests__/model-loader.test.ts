import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadDeployedModel, loadModelById } from '../src/model-loader.js';
import type { ModelRegistry } from '../src/model-registry.js';
import type { RegisteredModel } from '../src/types.js';

/** Create a mock ModelRegistry with configurable return values. */
function makeMockRegistry(overrides: {
  getDeployed?: RegisteredModel | null;
  findById?: RegisteredModel | null;
} = {}): ModelRegistry {
  return {
    getDeployed: vi.fn(() => overrides.getDeployed ?? null),
    findById: vi.fn(() => overrides.findById ?? null),
    register: vi.fn(),
    updateStatus: vi.fn(),
    listByStatus: vi.fn(() => []),
  } as unknown as ModelRegistry;
}

function makeModel(overrides: Partial<RegisteredModel> = {}): RegisteredModel {
  return {
    id: 'model-001',
    baseModel: 'qwen2.5:7b',
    datasetId: 'ds-1',
    trainingRunId: 'run-1',
    artifactPath: '/models/org-acme/v3',
    status: 'deployed',
    deployedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

// Mock the dynamic import of @useody/platform-core
vi.mock('@useody/platform-core', () => {
  const mockProvider = {
    getModelId: () => 'ody-custom/test-model',
    complete: vi.fn(async () => 'mock response'),
    async *stream() { yield 'mock stream'; },
  };

  return {
    CustomModelProvider: {
      create: vi.fn(async () => mockProvider),
      fromForgeArtifact: vi.fn(async () => mockProvider),
      fromLoraAdapter: vi.fn(async () => mockProvider),
    },
  };
});

describe('model-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadDeployedModel', () => {
    it('should return null when no deployed model exists', async () => {
      const registry = makeMockRegistry({ getDeployed: null });
      const result = await loadDeployedModel(registry);

      expect(result).toBeNull();
      expect(registry.getDeployed).toHaveBeenCalledOnce();
    });

    it('should return provider when a deployed model exists', async () => {
      const model = makeModel();
      const registry = makeMockRegistry({ getDeployed: model });
      const result = await loadDeployedModel(registry);

      expect(result).not.toBeNull();
      expect(result!.provider.getModelId()).toBe('ody-custom/test-model');
      expect(result!.model.id).toBe('model-001');
    });

    it('should log when no deployed model is found', async () => {
      const registry = makeMockRegistry({ getDeployed: null });
      const logger = vi.fn();
      await loadDeployedModel(registry, { logger });

      expect(logger).toHaveBeenCalledWith(
        'info',
        'No deployed model found in registry',
      );
    });

    it('should use GGUF path when artifact ends with .gguf', async () => {
      const model = makeModel({
        artifactPath: '/models/acme/model.gguf',
      });
      const registry = makeMockRegistry({ getDeployed: model });
      const { CustomModelProvider } = await import('@useody/platform-core');

      await loadDeployedModel(registry);

      expect(CustomModelProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          modelNameOrPath: '/models/acme/model.gguf',
        }),
      );
    });

    it('should try Forge artifact format for directory paths', async () => {
      const model = makeModel({
        artifactPath: '/models/org-acme/v3',
      });
      const registry = makeMockRegistry({ getDeployed: model });
      const { CustomModelProvider } = await import('@useody/platform-core');

      await loadDeployedModel(registry);

      expect(CustomModelProvider.fromForgeArtifact).toHaveBeenCalledWith(
        '/models/org-acme/v3',
        expect.any(Object),
      );
    });

    it('should fall back to LoRA adapter when Forge artifact fails', async () => {
      const model = makeModel({
        artifactPath: '/models/org-acme/lora',
        baseModel: 'qwen2.5:7b',
      });
      const registry = makeMockRegistry({ getDeployed: model });
      const { CustomModelProvider } = await import('@useody/platform-core');

      // Make fromForgeArtifact fail so it falls back to fromLoraAdapter
      (CustomModelProvider.fromForgeArtifact as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('no artifact-meta.json'));

      await loadDeployedModel(registry);

      expect(CustomModelProvider.fromLoraAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          baseModel: 'qwen2.5:7b',
          adapterPath: '/models/org-acme/lora',
          modelId: 'model-001',
        }),
      );
    });

    it('should pass options through to the provider', async () => {
      const model = makeModel({
        artifactPath: '/models/acme/model.gguf',
      });
      const registry = makeMockRegistry({ getDeployed: model });
      const { CustomModelProvider } = await import('@useody/platform-core');

      await loadDeployedModel(registry, {
        baseUrl: 'http://gpu-server:11434',
        temperature: 0.3,
        maxTokens: 500,
      });

      expect(CustomModelProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'http://gpu-server:11434',
          temperature: 0.3,
          maxTokens: 500,
        }),
      );
    });
  });

  describe('loadModelById', () => {
    it('should return null when model ID is not found', async () => {
      const registry = makeMockRegistry({ findById: null });
      const result = await loadModelById(registry, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return provider when model ID exists', async () => {
      const model = makeModel({ id: 'specific-model' });
      const registry = makeMockRegistry({ findById: model });
      const result = await loadModelById(registry, 'specific-model');

      expect(result).not.toBeNull();
      expect(result!.model.id).toBe('specific-model');
    });

    it('should log warning when model is not found', async () => {
      const registry = makeMockRegistry({ findById: null });
      const logger = vi.fn();
      await loadModelById(registry, 'missing-id', { logger });

      expect(logger).toHaveBeenCalledWith(
        'warn',
        'Model not found: missing-id',
      );
    });
  });
});
