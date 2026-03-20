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

/** Timeout (ms) for the TransformersJS availability check. */
export const TRANSFORMERS_TIMEOUT_MS = 15_000;

/** Optional logger callback for embedding cascade debug output. */
export type EmbeddingLog = (message: string) => void;

/**
 * Create the appropriate EmbeddingProvider using a zero-config cascade:
 *
 * 1. Ollama (if running locally + has an embedding model) — fast, private
 * 2. TransformersJS with Xenova/all-MiniLM-L6-v2 — 384 dims, ~23 MB ONNX,
 *    no signup, works offline after first model download. Guarded by a 15 s
 *    timeout so a hanging ONNX load does not block the CLI forever.
 * 3. Cohere (if COHERE_API_KEY env var set)
 * 4. OpenAI (if OPENAI_API_KEY env var set + provider configured)
 * 5. null — no provider available
 */
export async function detectEmbeddingProvider(
  config: RefineConfig,
  log: EmbeddingLog = () => {},
): Promise<EmbeddingProvider | null> {
  try {
    const mod = await import('@useody/platform-core');

    // ── 1. Ollama (local, free, private) ────────────────────────────
    log('Checking Ollama at ' + config.ollama.baseUrl + ' ...');
    const ollama = await detectOllama(config.ollama.baseUrl);
    if (ollama.available) {
      const model =
        findEmbeddingModel(ollama.models) ?? config.embedding.model;
      if (model && 'OllamaEmbeddingProvider' in mod) {
        log(`Using Ollama embedding model: ${model}`);
        return new mod.OllamaEmbeddingProvider({
          baseUrl: config.ollama.baseUrl,
          model,
        });
      }
      log('Ollama is running but no embedding model found.');
    } else {
      log('Ollama not reachable — skipping.');
    }

    // ── 2. TransformersJS (zero-config, offline after first run) ────
    if ('isTransformersAvailable' in mod) {
      log('Checking @huggingface/transformers availability ...');
      try {
        const check = mod.isTransformersAvailable() as Promise<boolean>;
        const timeout = new Promise<false>((resolve) => {
          setTimeout(() => resolve(false), TRANSFORMERS_TIMEOUT_MS);
        });
        const available = await Promise.race([check, timeout]);
        if (available && 'TransformersEmbeddingProvider' in mod) {
          log(
            'Using TransformersJS (Xenova/all-MiniLM-L6-v2, 384 dims). ' +
              'First run may download ~23 MB ONNX model.',
          );
          return new mod.TransformersEmbeddingProvider();
        }
        if (!available) {
          log(
            `TransformersJS check timed out after ${TRANSFORMERS_TIMEOUT_MS / 1000}s ` +
              'or module not importable — skipping. ' +
              'If this persists, install manually: pnpm add @huggingface/transformers',
          );
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : String(err);
        log(`TransformersJS not usable: ${msg} — skipping.`);
      }
    }

    // ── 3. Cohere (cloud, needs API key) ────────────────────────────
    const cohereKey =
      process.env['COHERE_API_KEY'] ?? config.embedding.apiKey;
    if (cohereKey && 'CohereEmbeddingProvider' in mod) {
      log('Using Cohere embedding (embed-english-v3.0).');
      return new mod.CohereEmbeddingProvider({
        apiKey: cohereKey,
        model: 'embed-english-v3.0',
      });
    }

    // ── 4. OpenAI (cloud, needs API key + explicit config) ──────────
    const openaiKey =
      process.env['OPENAI_API_KEY'] ?? config.embedding.apiKey;
    if (openaiKey && config.embedding.provider === 'openai') {
      if ('OpenAIEmbeddingProvider' in mod) {
        log(`Using OpenAI embedding (${config.embedding.model}).`);
        return new mod.OpenAIEmbeddingProvider({
          apiKey: openaiKey,
          model: config.embedding.model,
        });
      }
    }

    log(
      'No embedding provider available. ' +
        'Install Ollama (https://ollama.ai) or run: pnpm add @huggingface/transformers',
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Embedding provider detection failed: ${msg}`);
  }

  return null;
}

/** Known LLM model name prefixes in preference order. */
const LLM_MODEL_PREFIXES = ['llama', 'mistral', 'gemma', 'phi', 'qwen'];

/** Options for explicit provider/model override from CLI flags. */
export interface LlmDetectOptions {
  /** Explicit provider name (e.g. 'anthropic', 'groq'). */
  provider?: string;
  /** Explicit model override (e.g. 'gpt-4o-mini'). */
  model?: string;
}

/**
 * Detect the best available LLM provider using a smart cascade:
 * 1. Explicit --provider flag (highest priority)
 * 2. Cloud APIs via env vars (ANTHROPIC → OPENAI → GROQ → GEMINI → XAI → OPENROUTER)
 * 3. MLX (Apple Silicon local)
 * 4. Ollama (local, any model)
 */
export async function detectLlmProvider(
  config: RefineConfig,
  options?: LlmDetectOptions,
): Promise<LLMProvider | undefined> {
  try {
    const mod = await import('@useody/platform-core');

    // 1. Explicit --provider flag takes absolute priority
    if (options?.provider && 'createLlmProvider' in mod) {
      return mod.createLlmProvider(
        options.provider as import('@useody/platform-core').ProviderName,
        { model: options.model },
      );
    }

    // 2. Cloud API env var cascade (in quality/cost priority order)
    if ('createLlmProvider' in mod && 'PROVIDER_DETECTION_ORDER' in mod) {
      const order = mod.PROVIDER_DETECTION_ORDER as string[];
      const presets: Record<string, { envKey: string }> = {
        ...(mod.OPENAI_COMPATIBLE_PRESETS as Record<string, { envKey: string }>),
        anthropic: mod.ANTHROPIC_PRESET as { envKey: string },
      };
      for (const name of order) {
        const preset = presets[name];
        if (!preset) continue;
        const key = process.env[preset.envKey];
        if (key) {
          return mod.createLlmProvider(
            name as import('@useody/platform-core').ProviderName,
            { apiKey: key, model: options?.model },
          );
        }
      }
    }

    // 3. Try MLX (fastest on Apple Silicon)
    if ('isMlxAvailable' in mod) {
      const mlxReady = await (mod.isMlxAvailable as () => Promise<boolean>)();
      if (mlxReady && 'MlxLLMProvider' in mod) {
        return new mod.MlxLLMProvider();
      }
    }

    // 4. Try Ollama (local, free)
    const ollama = await detectOllama(config.ollama.baseUrl);
    if (ollama.available) {
      const llmModel = options?.model ?? ollama.models.find(
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
