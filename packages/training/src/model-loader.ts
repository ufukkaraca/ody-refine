/**
 * Model loader — resolves the best deployed model for an org and returns
 * an LLMProvider ready for Colleague to use.
 * @module training/model-loader
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LLMProvider } from '@useody/platform-core';
import type { ModelRegistry } from './model-registry.js';
import type { RegisteredModel, ArtifactMeta } from './types.js';

/** Logger callback type for model loader operations. */
export type ModelLoaderLogger = (
  level: 'info' | 'warn' | 'error',
  msg: string,
) => void;

/** Options for loading a deployed model. */
export interface LoadModelOptions {
  /** Ollama base URL. */
  baseUrl?: string;
  /** Temperature for generation. */
  temperature?: number;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Optional logger callback. */
  logger?: ModelLoaderLogger;
}

/** Result of a successful model load. */
export interface LoadedModel {
  provider: LLMProvider;
  model: RegisteredModel;
}

/**
 * Load the currently deployed model for serving.
 * Returns null if no model is deployed in the registry.
 */
export async function loadDeployedModel(
  registry: ModelRegistry,
  options?: LoadModelOptions,
): Promise<LoadedModel | null> {
  const deployed = registry.getDeployed();
  if (!deployed) {
    options?.logger?.('info', 'No deployed model found in registry');
    return null;
  }

  return loadRegisteredModel(deployed, options);
}

/**
 * Load a specific registered model by ID.
 * Returns null if the model is not found.
 */
export async function loadModelById(
  registry: ModelRegistry,
  modelId: string,
  options?: LoadModelOptions,
): Promise<LoadedModel | null> {
  const model = registry.findById(modelId);
  if (!model) {
    options?.logger?.('warn', `Model not found: ${modelId}`);
    return null;
  }

  return loadRegisteredModel(model, options);
}

/**
 * Internal: load a RegisteredModel into an LLMProvider.
 * Uses dynamic import to avoid circular dependency with @useody/platform-core.
 */
async function loadRegisteredModel(
  model: RegisteredModel,
  options?: LoadModelOptions,
): Promise<LoadedModel> {
  const log = options?.logger ?? (() => {});

  // Dynamic import to avoid circular dependency — core is a dependency of training
  const { CustomModelProvider } = await import(
    '@useody/platform-core'
  ) as typeof import('@useody/platform-core');

  // Try to read artifact-meta.json for the actual path
  const artifactPath = await resolveArtifactPath(model.artifactPath, log);

  log('info', `Loading model ${model.id} (base: ${model.baseModel}) from ${artifactPath}`);

  // Determine loading strategy based on artifact path
  const provider = await resolveProvider(
    CustomModelProvider, artifactPath, model, options,
  );

  log('info', `Model ${model.id} loaded as ${provider.getModelId()}`);

  return { provider, model };
}

/**
 * Read artifact-meta.json from the artifact directory to resolve the actual model path.
 * Falls back to the registered path if the file is missing or unreadable.
 */
async function resolveArtifactPath(
  registeredPath: string,
  log: ModelLoaderLogger | (() => void),
): Promise<string> {
  try {
    const metaPath = join(registeredPath, 'artifact-meta.json');
    const raw = await readFile(metaPath, 'utf-8');
    const meta = JSON.parse(raw) as ArtifactMeta;
    if (meta.modelPath && meta.modelPath !== registeredPath) {
      (log as ModelLoaderLogger)?.('info', `Resolved artifact path from meta: ${meta.modelPath}`);
      return meta.modelPath;
    }
  } catch {
    // No artifact-meta.json — use registered path as-is
  }
  return registeredPath;
}

/** Resolve the correct provider based on the artifact path format. */
async function resolveProvider(
  CustomModelProvider: typeof import('@useody/platform-core')['CustomModelProvider'],
  artifactPath: string,
  model: RegisteredModel,
  options?: LoadModelOptions,
): Promise<LLMProvider> {
  const providerOpts = {
    baseUrl: options?.baseUrl,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    logger: options?.logger,
  };

  // If artifact path ends with .gguf, load directly
  if (artifactPath.endsWith('.gguf')) {
    return CustomModelProvider.create({
      modelNameOrPath: artifactPath,
      ...providerOpts,
    });
  }

  // If artifact path is a directory, try Forge artifact format first
  try {
    return await CustomModelProvider.fromForgeArtifact(
      artifactPath, providerOpts,
    );
  } catch {
    // Fallback: treat as a LoRA adapter directory
    return CustomModelProvider.fromLoraAdapter({
      baseModel: model.baseModel,
      adapterPath: artifactPath,
      modelId: model.id,
      ...providerOpts,
    });
  }
}
