/**
 * MLX LLM provider — uses Apple Silicon MLX via Python sidecar.
 * Dramatically faster than Ollama on M-series Macs for short prompts.
 * @module providers/mlx-llm
 */
import { spawn } from 'node:child_process';
import type { ChatMessage, LLMCompletionOptions, LLMProvider } from '../types.js';

/** Configuration for the MLX LLM provider. */
export interface MlxLLMConfig {
  model?: string;
  venvPath?: string;
}

const DEFAULT_MODEL = 'mlx-community/Qwen3-4B-Instruct-2507-4bit';
const DEFAULT_VENV = '/tmp/mlx-env';

/**
 * LLM provider using Apple Silicon MLX for fast local inference.
 * Requires: Python venv with mlx-lm installed.
 */
export class MlxLLMProvider implements LLMProvider {
  private readonly model: string;
  private readonly venvPath: string;

  constructor(config?: MlxLLMConfig) {
    this.model = config?.model ?? DEFAULT_MODEL;
    this.venvPath = config?.venvPath ?? DEFAULT_VENV;
  }

  /** Run a completion via MLX Python sidecar. */
  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): Promise<string> {
    const prompt = messages.map((m) => {
      if (m.role === 'system') return `System: ${m.content}\n`;
      if (m.role === 'user') return `User: ${m.content}\n`;
      return `Assistant: ${m.content}\n`;
    }).join('');

    const maxTokens = options?.maxTokens ?? 200;

    const script = `
import json, sys
from mlx_lm import load, generate
model, tokenizer = load("${this.model}")
response = generate(model, tokenizer, prompt=json.loads(sys.argv[1]), max_tokens=${String(maxTokens)})
print(response)
`;

    return new Promise<string>((resolve, reject) => {
      const pythonPath = `${this.venvPath}/bin/python3`;
      const child = spawn(pythonPath, [
        '-c', script, JSON.stringify(prompt),
      ], { timeout: 30_000 });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`MLX process exited ${String(code)}: ${stderr}`));
        }
      });
      child.on('error', reject);
    });
  }

  /** Streaming not supported for MLX sidecar — yields full response. */
  async *stream(
    messages: ChatMessage[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<string, void, unknown> {
    const result = await this.complete(messages, options);
    yield result;
  }

  getModelId(): string {
    return `mlx/${this.model.split('/').pop() ?? 'unknown'}`;
  }
}

/** Check if MLX is available (venv exists with mlx-lm). */
export async function isMlxAvailable(
  venvPath: string = DEFAULT_VENV,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(`${venvPath}/bin/python3`, [
      '-c', 'import mlx_lm; print("ok")',
    ], { timeout: 5_000 });
    let ok = false;
    child.stdout.on('data', (d: Buffer) => {
      if (d.toString().includes('ok')) ok = true;
    });
    child.on('close', () => resolve(ok));
    child.on('error', () => resolve(false));
  });
}
