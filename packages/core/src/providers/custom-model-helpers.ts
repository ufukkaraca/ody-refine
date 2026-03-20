/**
 * Internal helpers for the custom model provider — Ollama model management.
 * @module providers/custom-model-helpers
 */
import { basename } from 'node:path';

/** Tag entry returned by Ollama /api/tags. */
export interface OllamaTagEntry { name?: string }

/** Generate an Ollama-friendly model name from a GGUF file path. */
export function generateModelName(ggufPath: string): string {
  const base = basename(ggufPath, '.gguf')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
  const ts = Date.now().toString(36);
  return `ody-${base}-${ts}`;
}

/** Check if a model exists in the local Ollama instance. */
export async function modelExists(baseUrl: string, modelName: string): Promise<boolean> {
  const res = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) return false;

  const json = (await res.json()) as { models?: OllamaTagEntry[] };
  const models = json.models ?? [];
  return models.some((m) => {
    const name = m.name ?? '';
    return name === modelName || name.startsWith(`${modelName}:`);
  });
}

/** Import a GGUF file into Ollama by creating a model via the API. */
export async function importGguf(
  baseUrl: string,
  ggufPath: string,
  modelName: string,
): Promise<void> {
  const modelfile = `FROM ${ggufPath}\n`;

  const res = await fetch(`${baseUrl}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, modelfile, stream: false }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to import GGUF into Ollama (${res.status}): ${text}`,
    );
  }
}

/** Register a LoRA adapter on top of a base Ollama model. */
export async function importLoraAdapter(
  baseUrl: string,
  baseModel: string,
  adapterPath: string,
  modelName: string,
): Promise<void> {
  const modelfile = `FROM ${baseModel}\nADAPTER ${adapterPath}\n`;

  const res = await fetch(`${baseUrl}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, modelfile, stream: false }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to register LoRA adapter in Ollama (${res.status}): ${text}`,
    );
  }
}
