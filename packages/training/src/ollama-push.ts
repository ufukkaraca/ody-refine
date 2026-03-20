/**
 * Push a trained model artifact into a local Ollama instance.
 * Generates a Modelfile and calls Ollama's POST /api/create endpoint.
 * @module training/ollama-push
 */

import { access } from 'node:fs/promises';
import type { ModelArtifact } from './types.js';

/** Default Ollama base URL. */
export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

/** Options for pushing a model to Ollama. */
export interface OllamaPushOptions {
  /** Ollama base URL. Defaults to http://127.0.0.1:11434. */
  baseUrl?: string;
  /** Custom model tag. Defaults to `ody-custom:latest`. */
  tag?: string;
  /** System prompt to bake into the Modelfile. */
  systemPrompt?: string;
  /** Optional logger callback. */
  logger?: (level: 'info' | 'warn' | 'error', msg: string) => void;
}

/** Result of a successful Ollama push. */
export interface OllamaPushResult {
  /** The Ollama model tag that was registered. */
  tag: string;
  /** The Modelfile content that was sent. */
  modelfile: string;
}

/** Error thrown when Ollama is unreachable or returns an error. */
export class OllamaPushError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OllamaPushError';
  }
}

/**
 * Build a Modelfile string for the given artifact.
 * - GGUF: uses `FROM <path>` pointing directly at the GGUF file.
 * - LoRA/safetensors: uses `FROM <baseModel>` and `ADAPTER <path>`.
 */
export function buildModelfile(
  artifact: ModelArtifact,
  systemPrompt?: string,
): string {
  const lines: string[] = [];

  if (artifact.format === 'gguf') {
    lines.push(`FROM ${artifact.path}`);
  } else {
    // LoRA or safetensors — reference the base model and attach the adapter
    lines.push(`FROM ${artifact.baseModel}`);
    lines.push(`ADAPTER ${artifact.path}`);
  }

  if (systemPrompt) {
    lines.push(`SYSTEM """${systemPrompt}"""`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Push a model artifact to Ollama so it can be served via `/api/chat`.
 *
 * @param artifact - The training output artifact.
 * @param options  - Push configuration.
 * @returns The Ollama tag and Modelfile used.
 * @throws {OllamaPushError} When the artifact is missing, Ollama is
 *   unreachable, or the create request fails.
 */
export async function pushToOllama(
  artifact: ModelArtifact,
  options: OllamaPushOptions = {},
): Promise<OllamaPushResult> {
  const baseUrl = options.baseUrl ?? DEFAULT_OLLAMA_URL;
  const tag = options.tag ?? 'ody-custom:latest';
  const log = options.logger;

  // Verify the artifact path exists on disk
  try {
    await access(artifact.path);
  } catch {
    throw new OllamaPushError(
      `Artifact path not found: ${artifact.path}`,
    );
  }

  const modelfile = buildModelfile(artifact, options.systemPrompt);
  log?.('info', `Creating Ollama model "${tag}" from ${artifact.format} artifact`);

  const url = `${baseUrl.replace(/\/+$/, '')}/api/create`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: tag, modelfile, stream: false }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new OllamaPushError(
      `Failed to connect to Ollama at ${baseUrl}: ${msg}`,
      err,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    throw new OllamaPushError(
      `Ollama create failed (HTTP ${res.status}): ${body}`,
    );
  }

  log?.('info', `Model "${tag}" registered in Ollama`);
  return { tag, modelfile };
}
