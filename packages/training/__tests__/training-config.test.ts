import { describe, it, expect } from 'vitest';
import { generateTrainingScript } from '../src/training-config.js';
import type { TrainingConfig } from '../src/types.js';

describe('generateTrainingScript', () => {
  describe('SFT method', () => {
    it('should generate a valid SFT training script', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'meta-llama/llama-3-70b',
        method: 'sft',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('#!/usr/bin/env python3');
      expect(script).toContain('SFTTrainer');
      expect(script).toContain('meta-llama/llama-3-70b');
      expect(script).toContain('LEARNING_RATE = 0.00002');
      expect(script).toContain('NUM_EPOCHS = 3');
      expect(script).toContain('BATCH_SIZE = 4');
      expect(script).toContain('WARMUP_STEPS = 100');
      expect(script).toContain('trainer.train()');
    });

    it('should use SFTConfig instead of TrainingArguments', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('from trl import SFTTrainer, SFTConfig');
      expect(script).toContain('SFTConfig(');
      expect(script).not.toContain('TrainingArguments');
    });

    it('should include LoRA configuration for SFT', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('from peft import LoraConfig');
      expect(script).toContain('LoraConfig(');
      expect(script).toContain('peft_config=peft_config');
      expect(script).toContain('r=16');
      expect(script).toContain('lora_alpha=32');
    });

    it('should include tokenization config for SFT', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('MAX_SEQ_LENGTH = 1024');
      expect(script).toContain('max_length=MAX_SEQ_LENGTH');
      expect(script).toContain('pad_token');
    });

    it('should validate SFT dataset columns', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('required_columns');
      expect(script).toContain('"instruction"');
      expect(script).toContain('"response"');
      expect(script).toContain('raise ValueError');
    });

    it('should use custom hyperparams', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'mistral-7b',
        method: 'sft',
        provider: 'local',
        hyperparams: {
          learningRate: 1e-4,
          epochs: 5,
          batchSize: 8,
          warmupSteps: 200,
        },
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('LEARNING_RATE = 0.0001');
      expect(script).toContain('NUM_EPOCHS = 5');
      expect(script).toContain('BATCH_SIZE = 8');
      expect(script).toContain('WARMUP_STEPS = 200');
    });
  });

  describe('DPO method', () => {
    it('should generate a valid DPO training script with DPOConfig', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'meta-llama/llama-3-70b',
        method: 'dpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('DPOTrainer');
      expect(script).toContain('DPOConfig');
      expect(script).toContain('ref_model=None');
      expect(script).toContain('DPO training complete');
      expect(script).not.toContain('SFTTrainer');
    });

    it('should use DPOConfig instead of TrainingArguments', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'dpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('from trl import DPOTrainer, DPOConfig');
      expect(script).toContain('DPOConfig(');
      expect(script).not.toContain('TrainingArguments');
    });

    it('should include LoRA configuration', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'dpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('from peft import LoraConfig');
      expect(script).toContain('LoraConfig(');
      expect(script).toContain('peft_config=peft_config');
      expect(script).toContain('r=16');
      expect(script).toContain('lora_alpha=32');
    });

    it('should NOT load a separate ref_model (OOM risk)', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'dpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      // Should use ref_model=None (PEFT handles implicit reference)
      expect(script).toContain('ref_model=None');
      // Should NOT load a second full model copy
      const modelLoadCount = (script.match(/AutoModelForCausalLM\.from_pretrained/g) ?? []).length;
      expect(modelLoadCount).toBe(1);
    });

    it('should include dataset column validation', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'dpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('required_columns');
      expect(script).toContain('"prompt"');
      expect(script).toContain('"chosen"');
      expect(script).toContain('"rejected"');
      expect(script).toContain('raise ValueError');
    });

    it('should include tokenization config', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'dpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('MAX_LENGTH = 1024');
      expect(script).toContain('max_length=MAX_LENGTH');
      expect(script).toContain('pad_token');
    });

    it('should save LoRA adapter, not full model', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'dpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('model.save_pretrained');
      expect(script).toContain('tokenizer.save_pretrained');
    });

    it('should set beta inside DPOConfig, not DPOTrainer', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'dpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      const dpoConfigSection = script.slice(
        script.indexOf('DPOConfig('),
        script.indexOf(')', script.indexOf('DPOConfig(') + 200) + 1,
      );
      expect(dpoConfigSection).toContain('beta=0.1');
    });
  });

  describe('GRPO method', () => {
    it('should generate a real GRPO training script', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'llama-3-8b',
        method: 'grpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('GRPOTrainer');
      expect(script).toContain('GRPOConfig');
      expect(script).toContain('llama-3-8b');
      expect(script).toContain('GRPO training complete');
      expect(script).not.toContain('SFTTrainer');
    });

    it('should include LoRA and reward function', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'grpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('LoraConfig');
      expect(script).toContain('reward_fn');
      expect(script).toContain('reward_funcs');
      expect(script).toContain('GROUP_SIZE');
    });

    it('should validate prompt column exists', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'grpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('"prompt" not in dataset.column_names');
      expect(script).toContain('raise ValueError');
    });

    it('should use GRPOConfig instead of TrainingArguments', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'grpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('GRPOConfig(');
      expect(script).not.toContain('TrainingArguments');
    });
  });

  describe('script structure', () => {
    it('should include dataset path loading from sys.argv', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('import sys');
      expect(script).toContain('sys.argv[1]');
      expect(script).toContain('Loading dataset from');
    });

    it('should import load_dataset from datasets', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('from datasets import load_dataset');
    });

    it('SFT should load dataset object and pass to trainer — not a raw path', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('load_dataset("json"');
      expect(script).toContain('train_dataset=dataset');
      expect(script).toContain('apply_chat_template');
      expect(script).not.toContain('train_dataset=dataset_path');
    });

    it('DPO should load dataset object and pass to trainer — not a raw path', () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'dpo',
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('load_dataset("json"');
      expect(script).toContain('train_dataset=dataset');
      expect(script).not.toContain('train_dataset=dataset_path');
    });

    it('all methods should never use TrainingArguments', () => {
      const methods = ['sft', 'dpo', 'grpo'] as const;
      for (const method of methods) {
        const config: TrainingConfig = {
          datasetId: 'ds-1',
          baseModel: 'test-model',
          method,
          provider: 'local',
        };
        const script = generateTrainingScript(config);
        expect(script).not.toContain('TrainingArguments');
      }
    });

    it('all methods should include LoRA configuration', () => {
      const methods = ['sft', 'dpo', 'grpo'] as const;
      for (const method of methods) {
        const config: TrainingConfig = {
          datasetId: 'ds-1',
          baseModel: 'test-model',
          method,
          provider: 'local',
        };
        const script = generateTrainingScript(config);
        expect(script).toContain('LoraConfig');
        expect(script).toContain('peft_config');
      }
    });
  });
});
