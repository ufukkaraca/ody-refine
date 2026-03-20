/**
 * Local trainer that spawns a Python training process.
 * @module training/local-trainer
 */

import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TrainingConfig, ModelArtifact, ArtifactMeta } from './types.js';
import { generateTrainingScript } from './training-config.js';

/** Logger callback for streaming training output. */
export type TrainerLogger = (level: 'stdout' | 'stderr', data: string) => void;

/** Default training timeout: 1 hour in milliseconds. */
export const DEFAULT_TRAINING_TIMEOUT_MS = 3_600_000;

/** Default max memory for child process output buffer: 512 MB. */
export const DEFAULT_MAX_MEMORY_MB = 512;

/** Options for the local trainer. */
export interface LocalTrainerOptions {
  logger?: TrainerLogger;
  pythonBin?: string;
  outputDir?: string;
  /** Timeout in ms for the training process. Default: 3600000 (1 hour). */
  timeoutMs?: number;
  /** Max memory in MB for child process output buffer. Default: 512. */
  maxMemoryMb?: number;
}

/** Spawns a local Python process to run model training. */
export class LocalTrainer {
  private readonly logger: TrainerLogger | undefined;
  private readonly pythonBin: string;
  private readonly outputDir: string;
  readonly timeoutMs: number;
  readonly maxMemoryMb: number;

  constructor(options?: LocalTrainerOptions) {
    this.logger = options?.logger;
    this.pythonBin = options?.pythonBin
      ?? process.env['ODY_PYTHON_BIN']
      ?? 'python3';
    this.outputDir = options?.outputDir
      ?? process.env['ODY_TRAINING_OUTPUT']
      ?? join(tmpdir(), 'ody-training');
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TRAINING_TIMEOUT_MS;
    this.maxMemoryMb = options?.maxMemoryMb ?? DEFAULT_MAX_MEMORY_MB;
  }

  /**
   * Run training by generating and executing a Python script.
   * @returns The resulting model artifact metadata.
   */
  async train(
    config: TrainingConfig,
    datasetPath: string,
  ): Promise<ModelArtifact> {
    const artifactPath = join(this.outputDir, config.baseModel, 'output');
    const script = generateTrainingScript(config, artifactPath);
    const scriptPath = join(
      tmpdir(),
      `ody-train-${crypto.randomUUID()}.py`,
    );

    await writeFile(scriptPath, script, 'utf-8');

    try {
      await this.runPython(scriptPath, datasetPath, artifactPath);
    } finally {
      await unlink(scriptPath).catch(() => {});
    }

    // Emit artifact-meta.json so model-loader can find the artifact
    await mkdir(artifactPath, { recursive: true });
    const meta: ArtifactMeta = {
      modelPath: artifactPath,
      baseModel: config.baseModel,
      method: config.method,
      timestamp: new Date().toISOString(),
    };
    await writeFile(
      join(artifactPath, 'artifact-meta.json'),
      JSON.stringify(meta, null, 2),
      'utf-8',
    );

    return {
      path: artifactPath,
      format: 'lora',
      baseModel: config.baseModel,
      sizeBytes: 0,
    };
  }

  private runPython(scriptPath: string, datasetPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const maxBufferBytes = this.maxMemoryMb * 1024 * 1024;

      const proc = spawn(this.pythonBin, [scriptPath, datasetPath, outputDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBytes = 0;
      let stderrBytes = 0;

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxBufferBytes) {
          this.logger?.('stderr', `stdout exceeded ${this.maxMemoryMb} MB buffer limit`);
        }
        this.logger?.('stdout', chunk.toString());
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes > maxBufferBytes) {
          this.logger?.('stderr', `stderr exceeded ${this.maxMemoryMb} MB buffer limit`);
        }
        this.logger?.('stderr', chunk.toString());
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill('SIGKILL');
        const minutes = Math.round(this.timeoutMs / 60_000);
        reject(new Error(`Training timed out after ${minutes} minutes`));
      }, this.timeoutMs);

      proc.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Training process exited with code ${code}`));
        }
      });
    });
  }
}
