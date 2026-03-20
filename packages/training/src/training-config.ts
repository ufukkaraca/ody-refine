/**
 * Generates Python training scripts from configuration.
 * @module training/training-config
 */

import type { TrainingConfig } from './types.js';
import { resolveModelForTraining } from './model-resolver.js';
import {
  generateSftBody,
  generateSftTrainCall,
  generateDpoBody,
  generateDpoTrainCall,
  generateGrpoBody,
  generateGrpoTrainCall,
} from './training-script-generators.js';

/**
 * Generate a Python training script for the given configuration.
 * Supports SFT, DPO (with LoRA + DPOConfig), and GRPO methods.
 * The script reads the dataset path from sys.argv[1].
 * @param config - Training configuration.
 * @param outputDir - Explicit output directory. Defaults to './output'.
 */
export function generateTrainingScript(config: TrainingConfig, outputDir?: string): string {
  const lr = config.hyperparams?.learningRate ?? 2e-5;
  const epochs = config.hyperparams?.epochs ?? 3;
  const batchSize = config.hyperparams?.batchSize ?? 4;
  const warmupSteps = config.hyperparams?.warmupSteps ?? 100;

  // Resolve Ollama tags to HuggingFace model IDs for training
  const resolvedModel = resolveModelForTraining(config.baseModel);
  const resolvedOutputDir = outputDir ?? './output';

  const header = [
    '#!/usr/bin/env python3',
    '"""Auto-generated training script by @ody/training."""',
    'import sys',
    'import json',
    'from pathlib import Path',
    'from datasets import load_dataset',
    '',
  ].join('\n');

  const datasetLoader = [
    'dataset_path = sys.argv[1] if len(sys.argv) > 1 else "dataset.jsonl"',
    `OUTPUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "${resolvedOutputDir}"`,
    'print(f"Loading dataset from {dataset_path}")',
    'print(f"Output directory: {OUTPUT_DIR}")',
    '',
  ].join('\n');

  if (config.method === 'sft') {
    return header + generateSftBody(resolvedModel, lr, epochs, batchSize, warmupSteps)
      + '\n' + datasetLoader + generateSftTrainCall();
  }

  if (config.method === 'dpo') {
    return header + generateDpoBody(resolvedModel, lr, epochs, batchSize, warmupSteps)
      + '\n' + datasetLoader + generateDpoTrainCall();
  }

  if (config.method === 'grpo') {
    return header + generateGrpoBody(resolvedModel, lr, epochs, batchSize, warmupSteps)
      + '\n' + datasetLoader + generateGrpoTrainCall();
  }

  return header + generateSftBody(resolvedModel, lr, epochs, batchSize, warmupSteps)
    + '\n' + datasetLoader + generateSftTrainCall();
}
