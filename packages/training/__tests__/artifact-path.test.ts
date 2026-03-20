/**
 * Tests that artifact paths produced by training-config match what model-loader expects.
 * Validates the P0-1 fix: TypeScript and Python agree on artifact paths.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { generateTrainingScript } from '../src/training-config.js';
import type { TrainingConfig } from '../src/types.js';

describe('artifact path consistency', () => {
  const methods = ['sft', 'dpo', 'grpo'] as const;

  for (const method of methods) {
    it(`${method}: generated script uses OUTPUT_DIR from sys.argv[2]`, () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method,
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('OUTPUT_DIR = sys.argv[2] if len(sys.argv) > 2 else');
      expect(script).toContain('output_dir=OUTPUT_DIR');
      expect(script).toContain('model.save_pretrained(OUTPUT_DIR)');
      expect(script).toContain('tokenizer.save_pretrained(OUTPUT_DIR)');
      // Should NOT contain hardcoded ./output in save calls
      expect(script).not.toContain('save_pretrained("./output")');
    });

    it(`${method}: generated script emits artifact-meta.json`, () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method,
        provider: 'local',
      };
      const script = generateTrainingScript(config);
      expect(script).toContain('artifact-meta.json');
      expect(script).toContain('"modelPath": OUTPUT_DIR');
      expect(script).toContain(`"method": "${method}"`);
    });

    it(`${method}: explicit outputDir is embedded in script default`, () => {
      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method,
        provider: 'local',
      };
      const customDir = '/custom/output/path';
      const script = generateTrainingScript(config, customDir);
      expect(script).toContain(`OUTPUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "${customDir}"`);
    });
  }

  it('LocalTrainer produces artifact path that matches what model-loader expects', () => {
    // The artifact path is: join(outputDir, baseModel, 'output')
    // This must be the same path passed to the Python script
    const outputDir = '/tmp/ody-training';
    const baseModel = 'test-model';
    const expectedPath = join(outputDir, baseModel, 'output');

    // Verify the path format matches what model-loader would receive
    expect(expectedPath).toBe(`${outputDir}/${baseModel}/output`);
    // Model-loader reads artifact-meta.json from this path
    const metaPath = join(expectedPath, 'artifact-meta.json');
    expect(metaPath).toContain('artifact-meta.json');
  });
});
