/**
 * Remote trainer that sends training jobs to Modal cloud GPUs.
 * Same interface as LocalTrainer — takes TrainingConfig, returns ModelArtifact.
 * @module training/remote-trainer
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TrainingConfig, ModelArtifact, ArtifactMeta } from './types.js';
import { generateTrainingScript } from './training-config.js';
import type { ModalClient, ModalClientOptions } from './modal-client.js';

/** Logger callback for remote training status updates. */
export type RemoteTrainerLogger = (msg: string) => void;

/** Options for the remote trainer. */
export interface RemoteTrainerOptions {
  logger?: RemoteTrainerLogger;
  outputDir?: string;
  /** Modal app name. Defaults to 'ody-training'. */
  appName?: string;
  /** Modal function name. Defaults to 'Trainer-train' (web endpoint). */
  functionName?: string;
  /** Override Modal client options (credentials, timeouts, etc.). */
  modalClientOptions?: ModalClientOptions;
  /** Injected ModalClient — for testing. */
  modalClient?: ModalClient;
}

/** GPU selection based on model size. */
function selectGpu(baseModel: string): string {
  const lower = baseModel.toLowerCase();
  // 7B+ models need A100; smaller models can use T4
  const largePatterns = ['7b', '8b', '9b', '13b', '14b', '32b', '70b'];
  for (const p of largePatterns) {
    if (lower.includes(p)) return 'A100';
  }
  return 'T4';
}

/**
 * Remote trainer that dispatches training jobs to Modal.
 * Generates the training script locally, sends it with the dataset,
 * polls for completion, and downloads the artifact.
 */
export class RemoteTrainer {
  private readonly logger: RemoteTrainerLogger | undefined;
  private readonly outputDir: string;
  private readonly appName: string;
  private readonly functionName: string;
  private readonly modalClient: ModalClient;

  constructor(options?: RemoteTrainerOptions) {
    this.logger = options?.logger;
    this.outputDir = options?.outputDir
      ?? process.env['ODY_TRAINING_OUTPUT']
      ?? join(tmpdir(), 'ody-training');
    this.appName = options?.appName ?? 'ody-training';
    this.functionName = options?.functionName ?? 'Trainer-train';

    if (options?.modalClient) {
      this.modalClient = options.modalClient;
    } else {
      // Lazy import to avoid requiring modal-client at module load
      throw new Error(
        'RemoteTrainer requires an injected ModalClient. ' +
        'Use RemoteTrainer.create() for automatic instantiation.',
      );
    }
  }

  /**
   * Factory method that creates a RemoteTrainer with a real ModalClient.
   * Avoids circular import issues and keeps constructor testable.
   */
  static async create(
    options?: Omit<RemoteTrainerOptions, 'modalClient'>,
  ): Promise<RemoteTrainer> {
    const { ModalClient: MC } = await import('./modal-client.js');
    const client = new MC({
      ...options?.modalClientOptions,
      logger: options?.logger,
    });
    return new RemoteTrainer({ ...options, modalClient: client });
  }

  /**
   * Run training remotely on Modal.
   * @returns The resulting model artifact metadata.
   */
  async train(
    config: TrainingConfig,
    datasetPath: string,
  ): Promise<ModelArtifact> {
    const artifactPath = join(
      this.outputDir,
      config.baseModel,
      'output',
    );
    this.logger?.(`Preparing remote training job for ${config.baseModel}...`);

    // Generate the training script
    const script = generateTrainingScript(config, artifactPath);

    // Read dataset contents
    const datasetContent = await readFile(datasetPath, 'utf-8');

    // Select GPU tier based on model size
    const gpu = config.compute?.gpuType ?? selectGpu(config.baseModel);
    this.logger?.(`Selected GPU: ${gpu}`);

    // Send to Modal
    this.logger?.('Submitting job to Modal...');
    const result = await this.modalClient.callAndWait(
      this.appName,
      this.functionName,
      {
        training_script: script,
        dataset_jsonl: datasetContent,
        base_model: config.baseModel,
        method: config.method,
        gpu,
      },
    );

    if (result.status === 'failed') {
      throw new Error(
        `Remote training failed: ${result.error ?? 'unknown error'}`,
      );
    }

    // Write artifact metadata locally
    await mkdir(artifactPath, { recursive: true });

    // If Modal returned output (model artifact info), write it
    if (result.output) {
      await writeFile(
        join(artifactPath, 'modal-result.json'),
        result.output,
        'utf-8',
      );
    }

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

    this.logger?.(`Training complete. Artifact: ${artifactPath}`);

    return {
      path: artifactPath,
      format: 'lora',
      baseModel: config.baseModel,
      sizeBytes: 0,
    };
  }
}
