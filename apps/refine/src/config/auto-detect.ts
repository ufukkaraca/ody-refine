/**
 * Auto-detection of Ollama, embedding, and LLM providers.
 * @module config/auto-detect
 */
import type { EmbeddingProvider, LLMProvider } from '@useody/platform-core';
import type { RefineConfig } from './schema.js';

/** Result of detecting a local Ollama instance. */
export interface OllamaDetectionResult {
  available: boolean;
  models: string[];
}

/** Known Ollama embedding models in preference order. */
const OLLAMA_EMBEDDING_MODELS = [
  'nomic-embed-text',
  'granite-embedding',
  'all-minilm',
  'mxbai-embed-large',
  'snowflake-arctic-embed',
];

/**
 * Detect whether Ollama is running at the given base URL.
 * Returns the list of available models if reachable.
 */
export async function detectOllama(
  baseUrl: string,
): Promise<OllamaDetectionResult> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return { available: false, models: [] };
    }
    const body = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = (body.models ?? [])
      .map((m) => m.name ?? '')
      .filter((name) => name.length > 0);
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

/** Find the best available embedding model from Ollama. */
function findEmbeddingModel(available: string[]): string | null {
  for (const preferred of OLLAMA_EMBEDDING_MODELS) {
    const match = available.find(
      (m) => m === preferred || m.startsWith(`${preferred}:`),
    );
    if (match) return match;
  }
  return null;
}

/**
 * Create the appropriate EmbeddingProvider using a smart cascade:
 * 1. Ollama (if running + has embedding model) — best quality
 * 2. Transformers.js (zero-config, offline after first run)
 * 3. Cohere (if COHERE_API_KEY env var set)
 * 4. OpenAI (if OPENAI_API_KEY env var set)
 * 5. null (no provider available)
 */
export async function detectEmbeddingProvider(
  config: RefineConfig,
): Promise<EmbeddingProvider | null> {
  try {
    const mod = await import('@useody/platform-core');

    // 1. Try Ollama (local, free, private)
    const ollama = await detectOllama(config.ollama.baseUrl);
    if (ollama.available) {
      const model =
        findEmbeddingModel(ollama.models) ?? config.embedding.model;
      if ('OllamaEmbeddingProvider' in mod) {
        return new mod.OllamaEmbeddingProvider({
          baseUrl: config.ollama.baseUrl,
          model,
        });
      }
    }

    // 2. Try transformers.js (zero-config, works offline)
    if ('isTransformersAvailable' in mod) {
      const available = await mod.isTransformersAvailable();
      if (available && 'TransformersEmbeddingProvider' in mod) {
        return new mod.TransformersEmbeddingProvider();
      }
    }

    // 3. Try Cohere via env var
    const cohereKey =
      process.env['COHERE_API_KEY'] ?? config.embedding.apiKey;
    if (cohereKey && 'CohereEmbeddingProvider' in mod) {
      return new mod.CohereEmbeddingProvider({
        apiKey: cohereKey,
        model: 'embed-english-v3.0',
      });
    }

    // 4. Try OpenAI via env var
    const openaiKey =
      process.env['OPENAI_API_KEY'] ?? config.embedding.apiKey;
    if (openaiKey && config.embedding.provider === 'openai') {
      if ('OpenAIEmbeddingProvider' in mod) {
        return new mod.OpenAIEmbeddingProvider({
          apiKey: openaiKey,
          model: config.embedding.model,
        });
      }
    }
  } catch {
    // Provider module not available
  }

  return null;
}

/** Known LLM model name prefixes in preference order. */
const LLM_MODEL_PREFIXES = ['llama', 'mistral', 'gemma', 'phi', 'qwen'];

/**
 * Try to create an LLM provider from Ollama.
 * Returns undefined if no LLM is available — detection is best-effort.
 */
export async function detectLlmProvider(
  config: RefineConfig,
): Promise<LLMProvider | undefined> {
  try {
    const mod = await import('@useody/platform-core');

    // 1. Try MLX first (fastest on Apple Silicon)
    if ('isMlxAvailable' in mod) {
      const mlxReady = await (mod.isMlxAvailable as () => Promise<boolean>)();
      if (mlxReady && 'MlxLLMProvider' in mod) {
        return new mod.MlxLLMProvider();
      }
    }

    // 2. Fall back to Ollama
    const ollama = await detectOllama(config.ollama.baseUrl);
    if (ollama.available) {
      const llmModel = ollama.models.find(
        (m) => LLM_MODEL_PREFIXES.some((prefix) => m.startsWith(prefix)),
      );
      if (llmModel && 'OllamaLLMProvider' in mod) {
        return new mod.OllamaLLMProvider({
          baseUrl: config.ollama.baseUrl,
          model: llmModel,
        });
      }
    }
  } catch {
    // No LLM available
  }
  return undefined;
}
