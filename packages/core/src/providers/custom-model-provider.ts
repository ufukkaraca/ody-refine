/**
 * Custom model provider — loads a Forge-trained LoRA adapter via Ollama.
 * Supports both pre-imported Ollama models and raw GGUF file paths.
 * @module providers/custom-model-provider
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChatMessage, LLMCompletionOptions, LLMProvider } from '../types.js';
import {
  generateModelName,
  importGguf,
  importLoraAdapter,
  modelExists,
} from './custom-model-helpers.js';

/** Configuration for the custom model provider. */
export interface CustomModelConfig {
  /** Ollama model name (if already imported) or path to GGUF file. */
  modelNameOrPath: string;
  /** Base URL for Ollama API. */
  baseUrl?: string;
  /** Temperature for generation. */
  temperature?: number;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Optional logger callback (no console.log in library code). */
  logger?: (level: 'info' | 'warn' | 'error', msg: string) => void;
}

/** Configuration for loading a LoRA adapter on top of a base model. */
export interface LoraAdapterConfig {
  /** Base Ollama model name (e.g., 'qwen2.5:7b'). */
  baseModel: string;
  /** Path to the LoRA adapter weights directory. */
  adapterPath: string;
  /** Unique model ID for tracking (e.g., 'org-acme-v3'). */
  modelId: string;
  /** Base URL for Ollama API. */
  baseUrl?: string;
  /** Temperature for generation. */
  temperature?: number;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Optional logger callback. */
  logger?: (level: 'info' | 'warn' | 'error', msg: string) => void;
}

/** Forge artifact metadata written alongside GGUF files. */
export interface ForgeArtifactMeta {
  baseModel: string;
  format: 'gguf' | 'lora' | 'safetensors';
  ggufPath: string;
  createdAt?: string;
  evalScores?: Record<string, number>;
}

/** LLM provider that loads a Forge-trained custom model via Ollama. */
export class CustomModelProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly modelName: string;
  private readonly temperature: number | undefined;
  private readonly maxTokens: number | undefined;

  private constructor(config: CustomModelConfig, resolvedModelName: string) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.modelName = resolvedModelName;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  /** Create a provider. Imports GGUF files into Ollama; verifies named models exist. */
  static async create(config: CustomModelConfig): Promise<CustomModelProvider> {
    const baseUrl = config.baseUrl ?? 'http://localhost:11434';
    const log = config.logger ?? (() => {});

    if (config.modelNameOrPath.endsWith('.gguf')) {
      const modelName = generateModelName(config.modelNameOrPath);
      const exists = await modelExists(baseUrl, modelName);
      if (!exists) {
        log('info', `Importing GGUF into Ollama as "${modelName}"…`);
        await importGguf(baseUrl, config.modelNameOrPath, modelName);
        log('info', `Model "${modelName}" imported successfully.`);
      }
      return new CustomModelProvider(config, modelName);
    }

    const exists = await modelExists(baseUrl, config.modelNameOrPath);
    if (!exists) {
      throw new Error(
        `Model "${config.modelNameOrPath}" not found in Ollama. ` +
        `Run "ollama pull ${config.modelNameOrPath}" or provide a GGUF path.`,
      );
    }
    return new CustomModelProvider(config, config.modelNameOrPath);
  }

  /** Create a provider by loading a LoRA adapter on top of a base Ollama model. */
  static async fromLoraAdapter(
    config: LoraAdapterConfig,
  ): Promise<CustomModelProvider> {
    const baseUrl = config.baseUrl ?? 'http://localhost:11434';
    const log = config.logger ?? (() => {});
    const ollamaName = `ody-lora-${config.modelId}`;

    const exists = await modelExists(baseUrl, ollamaName);
    if (!exists) {
      log('info', `Registering LoRA adapter "${config.modelId}" in Ollama...`);
      await importLoraAdapter(
        baseUrl, config.baseModel, config.adapterPath, ollamaName,
      );
      log('info', `LoRA model "${ollamaName}" registered successfully.`);
    }

    return new CustomModelProvider(
      {
        modelNameOrPath: ollamaName,
        baseUrl,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        logger: config.logger,
      },
      ollamaName,
    );
  }

  /** Create a provider from a Forge artifact directory (reads artifact-meta.json). */
  static async fromForgeArtifact(
    artifactPath: string,
    options?: { baseUrl?: string; temperature?: number; maxTokens?: number;
      logger?: (level: 'info' | 'warn' | 'error', msg: string) => void },
  ): Promise<CustomModelProvider> {
    const metaPath = join(artifactPath, 'artifact-meta.json');
    const raw = await readFile(metaPath, 'utf-8');
    const meta = JSON.parse(raw) as ForgeArtifactMeta;

    const ggufPath = meta.ggufPath.startsWith('/')
      ? meta.ggufPath
      : join(artifactPath, meta.ggufPath);

    return CustomModelProvider.create({
      modelNameOrPath: ggufPath,
      baseUrl: options?.baseUrl,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      logger: options?.logger,
    });
  }

  /** Get the model identifier. */
  getModelId(): string {
    return `ody-custom/${this.modelName}`;
  }

  /** Complete a chat conversation using the custom model. */
  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): Promise<string> {
    const body = {
      model: this.modelName,
      messages,
      stream: false,
      options: {
        temperature: options?.temperature ?? this.temperature,
        num_predict: options?.maxTokens ?? this.maxTokens,
        stop: options?.stopSequences,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Custom model chat failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? '';
  }

  /** Stream a chat conversation token by token. */
  async *stream(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<string, void, unknown> {
    const body = {
      model: this.modelName,
      messages,
      stream: true,
      options: {
        temperature: options?.temperature ?? this.temperature,
        num_predict: options?.maxTokens ?? this.maxTokens,
        stop: options?.stopSequences,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Custom model chat stream failed (${res.status}): ${text}`,
      );
    }

    if (!res.body) {
      throw new Error('Custom model chat stream returned no body');
    }

    const decoder = new TextDecoder();
    const reader = res.body.getReader();

    try {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as { message?: { content?: string } };
          const token = chunk.message?.content;
          if (token) yield token;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
