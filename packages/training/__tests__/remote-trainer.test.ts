import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile, rm } from 'node:fs/promises';
import { RemoteTrainer } from '../src/remote-trainer.js';
import type { ModalClient } from '../src/modal-client.js';
import type { TrainingConfig } from '../src/types.js';

/** Create a mock ModalClient for testing. */
function createMockModalClient(
  overrides?: Partial<ModalClient>,
): ModalClient {
  return {
    createFunctionCall: vi.fn().mockResolvedValue({
      functionCallId: 'fc-test-123',
      status: 'pending' as const,
    }),
    getFunctionCallStatus: vi.fn().mockResolvedValue({
      functionCallId: 'fc-test-123',
      status: 'completed' as const,
      output: '{"status":"complete"}',
    }),
    waitForCompletion: vi.fn().mockResolvedValue({
      functionCallId: 'fc-test-123',
      status: 'completed' as const,
      output: '{"status":"complete"}',
    }),
    callAndWait: vi.fn().mockResolvedValue({
      functionCallId: 'fc-test-123',
      status: 'completed' as const,
      output: '{"status":"complete","volumePath":"/artifacts/test"}',
    }),
    ...overrides,
  } as ModalClient;
}

describe('RemoteTrainer', () => {
  const testOutputDir = join(tmpdir(), `ody-remote-test-${Date.now()}`);
  let mockClient: ModalClient;

  beforeEach(() => {
    mockClient = createMockModalClient();
  });

  afterEach(async () => {
    await rm(testOutputDir, { recursive: true, force: true });
  });

  it('requires an injected ModalClient', () => {
    expect(() => new RemoteTrainer({ outputDir: testOutputDir }))
      .toThrow('requires an injected ModalClient');
  });

  it('accepts an injected ModalClient', () => {
    const trainer = new RemoteTrainer({
      outputDir: testOutputDir,
      modalClient: mockClient,
    });
    expect(trainer).toBeDefined();
  });

  describe('train', () => {
    it('sends training job to Modal and returns artifact', async () => {
      const trainer = new RemoteTrainer({
        outputDir: testOutputDir,
        modalClient: mockClient,
      });

      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'Qwen/Qwen2.5-0.5B',
        method: 'sft',
        provider: 'modal',
      };

      // Create a temp dataset file
      const { writeFile: wf, mkdir: mkd } = await import('node:fs/promises');
      const datasetDir = join(tmpdir(), `ody-test-ds-${Date.now()}`);
      await mkd(datasetDir, { recursive: true });
      const datasetPath = join(datasetDir, 'dataset.jsonl');
      await wf(datasetPath, '{"instruction":"hi","response":"hello"}\n');

      const artifact = await trainer.train(config, datasetPath);

      expect(artifact.path).toContain('Qwen/Qwen2.5-0.5B');
      expect(artifact.format).toBe('lora');
      expect(artifact.baseModel).toBe('Qwen/Qwen2.5-0.5B');

      // Verify Modal was called with correct params
      expect(mockClient.callAndWait).toHaveBeenCalledWith(
        'ody-training',
        'Trainer-train',
        expect.objectContaining({
          base_model: 'Qwen/Qwen2.5-0.5B',
          method: 'sft',
          gpu: 'T4',
        }),
      );

      // Verify artifact-meta.json was written
      const metaPath = join(artifact.path, 'artifact-meta.json');
      const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as Record<string, unknown>;
      expect(meta['baseModel']).toBe('Qwen/Qwen2.5-0.5B');
      expect(meta['method']).toBe('sft');

      // Cleanup
      await rm(datasetDir, { recursive: true, force: true });
    });

    it('selects A100 for large models', async () => {
      const trainer = new RemoteTrainer({
        outputDir: testOutputDir,
        modalClient: mockClient,
      });

      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'meta-llama/Llama-3.1-8B',
        method: 'dpo',
        provider: 'modal',
      };

      const { writeFile: wf, mkdir: mkd } = await import('node:fs/promises');
      const datasetDir = join(tmpdir(), `ody-test-ds2-${Date.now()}`);
      await mkd(datasetDir, { recursive: true });
      const datasetPath = join(datasetDir, 'dataset.jsonl');
      await wf(datasetPath, '{"prompt":"hi","chosen":"hello","rejected":"bye"}\n');

      await trainer.train(config, datasetPath);

      expect(mockClient.callAndWait).toHaveBeenCalledWith(
        'ody-training',
        'Trainer-train',
        expect.objectContaining({ gpu: 'A100' }),
      );

      await rm(datasetDir, { recursive: true, force: true });
    });

    it('uses custom GPU from config.compute', async () => {
      const trainer = new RemoteTrainer({
        outputDir: testOutputDir,
        modalClient: mockClient,
      });

      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'Qwen/Qwen2.5-3B',
        method: 'sft',
        provider: 'modal',
        compute: { gpuType: 'A100' },
      };

      const { writeFile: wf, mkdir: mkd } = await import('node:fs/promises');
      const datasetDir = join(tmpdir(), `ody-test-ds3-${Date.now()}`);
      await mkd(datasetDir, { recursive: true });
      const datasetPath = join(datasetDir, 'dataset.jsonl');
      await wf(datasetPath, '{"instruction":"hi","response":"hello"}\n');

      await trainer.train(config, datasetPath);

      expect(mockClient.callAndWait).toHaveBeenCalledWith(
        'ody-training',
        'Trainer-train',
        expect.objectContaining({ gpu: 'A100' }),
      );

      await rm(datasetDir, { recursive: true, force: true });
    });

    it('throws when remote training fails', async () => {
      const failClient = createMockModalClient({
        callAndWait: vi.fn().mockResolvedValue({
          functionCallId: 'fc-fail',
          status: 'failed' as const,
          error: 'GPU OOM',
        }),
      });

      const trainer = new RemoteTrainer({
        outputDir: testOutputDir,
        modalClient: failClient,
      });

      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'modal',
      };

      const { writeFile: wf, mkdir: mkd } = await import('node:fs/promises');
      const datasetDir = join(tmpdir(), `ody-test-ds4-${Date.now()}`);
      await mkd(datasetDir, { recursive: true });
      const datasetPath = join(datasetDir, 'dataset.jsonl');
      await wf(datasetPath, '{"instruction":"hi","response":"hello"}\n');

      await expect(trainer.train(config, datasetPath))
        .rejects.toThrow('Remote training failed: GPU OOM');

      await rm(datasetDir, { recursive: true, force: true });
    });

    it('writes modal-result.json when output is returned', async () => {
      const trainer = new RemoteTrainer({
        outputDir: testOutputDir,
        modalClient: mockClient,
      });

      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'modal',
      };

      const { writeFile: wf, mkdir: mkd } = await import('node:fs/promises');
      const datasetDir = join(tmpdir(), `ody-test-ds5-${Date.now()}`);
      await mkd(datasetDir, { recursive: true });
      const datasetPath = join(datasetDir, 'dataset.jsonl');
      await wf(datasetPath, '{"instruction":"hi","response":"hello"}\n');

      const artifact = await trainer.train(config, datasetPath);

      const resultPath = join(artifact.path, 'modal-result.json');
      const resultContent = await readFile(resultPath, 'utf-8');
      expect(resultContent).toContain('complete');

      await rm(datasetDir, { recursive: true, force: true });
    });

    it('calls logger with status updates', async () => {
      const logs: string[] = [];
      const trainer = new RemoteTrainer({
        outputDir: testOutputDir,
        modalClient: mockClient,
        logger: (msg) => logs.push(msg),
      });

      const config: TrainingConfig = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft',
        provider: 'modal',
      };

      const { writeFile: wf, mkdir: mkd } = await import('node:fs/promises');
      const datasetDir = join(tmpdir(), `ody-test-ds6-${Date.now()}`);
      await mkd(datasetDir, { recursive: true });
      const datasetPath = join(datasetDir, 'dataset.jsonl');
      await wf(datasetPath, '{"instruction":"hi","response":"hello"}\n');

      await trainer.train(config, datasetPath);

      expect(logs.some(l => l.includes('Preparing'))).toBe(true);
      expect(logs.some(l => l.includes('Submitting'))).toBe(true);
      expect(logs.some(l => l.includes('complete'))).toBe(true);

      await rm(datasetDir, { recursive: true, force: true });
    });
  });
});
