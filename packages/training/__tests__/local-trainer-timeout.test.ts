import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { LocalTrainer, DEFAULT_TRAINING_TIMEOUT_MS, DEFAULT_MAX_MEMORY_MB } from '../src/local-trainer.js';

/** Create a fake ChildProcess that never exits (simulates a hang). */
function createHangingProcess(): ChildProcess & { emitClose: (code: number) => void } {
  const proc = new EventEmitter() as ChildProcess & { emitClose: (code: number) => void };
  proc.stdout = new Readable({ read(): void { /* noop */ } });
  proc.stderr = new Readable({ read(): void { /* noop */ } });
  proc.pid = 12345;
  proc.kill = vi.fn().mockReturnValue(true);
  proc.emitClose = (code: number): void => { proc.emit('close', code); };
  return proc;
}

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(() => Promise.resolve()),
  unlink: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
}));

/** Flush microtasks so train() reaches runPython before we emit events. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('LocalTrainer timeout and memory limits', () => {
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import('node:child_process');
    spawnMock = cp.spawn as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports correct default constants', () => {
    expect(DEFAULT_TRAINING_TIMEOUT_MS).toBe(3_600_000);
    expect(DEFAULT_MAX_MEMORY_MB).toBe(512);
  });

  it('uses default 1-hour timeout when not configured', () => {
    const trainer = new LocalTrainer();
    expect(trainer.timeoutMs).toBe(3_600_000);
  });

  it('uses custom timeout from options', () => {
    const trainer = new LocalTrainer({ timeoutMs: 120_000 });
    expect(trainer.timeoutMs).toBe(120_000);
  });

  it('uses custom maxMemoryMb from options', () => {
    const trainer = new LocalTrainer({ maxMemoryMb: 1024 });
    expect(trainer.maxMemoryMb).toBe(1024);
  });

  it('uses default maxMemoryMb when not configured', () => {
    const trainer = new LocalTrainer();
    expect(trainer.maxMemoryMb).toBe(512);
  });

  it('resolves normally when process exits before timeout', async () => {
    const proc = createHangingProcess();
    spawnMock.mockReturnValue(proc);

    const trainer = new LocalTrainer({
      timeoutMs: 60_000,
      pythonBin: 'python3',
      outputDir: '/tmp/ody-test',
    });

    const config = {
      datasetId: 'ds-1',
      baseModel: 'test-model',
      method: 'sft' as const,
      provider: 'local' as const,
    };

    const trainPromise = trainer.train(config, '/tmp/dataset.jsonl');
    await flushMicrotasks();
    proc.emitClose(0);

    const result = await trainPromise;
    expect(result.baseModel).toBe('test-model');
    expect(result.format).toBe('lora');
  });

  it('logs warning when stdout exceeds buffer limit', async () => {
    const proc = createHangingProcess();
    spawnMock.mockReturnValue(proc);

    const logs: Array<{ level: string; data: string }> = [];
    const trainer = new LocalTrainer({
      timeoutMs: 60_000,
      maxMemoryMb: 1,
      pythonBin: 'python3',
      outputDir: '/tmp/ody-test',
      logger: (level, data) => logs.push({ level, data }),
    });

    const config = {
      datasetId: 'ds-1',
      baseModel: 'test-model',
      method: 'sft' as const,
      provider: 'local' as const,
    };

    const trainPromise = trainer.train(config, '/tmp/dataset.jsonl');
    await flushMicrotasks();

    const bigChunk = Buffer.alloc(1024 * 1024 + 1, 'x');
    proc.stdout!.emit('data', bigChunk);
    proc.emitClose(0);

    await trainPromise;

    const warnings = logs.filter(l => l.data.includes('exceeded'));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.data).toContain('1 MB buffer limit');
  });

  describe('timeout behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('kills process and throws on timeout', async () => {
      const proc = createHangingProcess();
      spawnMock.mockReturnValue(proc);

      const trainer = new LocalTrainer({
        timeoutMs: 5000,
        pythonBin: 'python3',
        outputDir: '/tmp/ody-test',
      });

      const config = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft' as const,
        provider: 'local' as const,
      };

      const trainPromise = trainer.train(config, '/tmp/dataset.jsonl');
      trainPromise.catch(() => {}); // prevent unhandled rejection warning
      await vi.advanceTimersByTimeAsync(6000);

      await expect(trainPromise).rejects.toThrow('Training timed out after 0 minutes');
      expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('reports correct minutes in timeout error message', async () => {
      const proc = createHangingProcess();
      spawnMock.mockReturnValue(proc);

      const trainer = new LocalTrainer({
        timeoutMs: 600_000,
        pythonBin: 'python3',
        outputDir: '/tmp/ody-test',
      });

      const config = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft' as const,
        provider: 'local' as const,
      };

      const trainPromise = trainer.train(config, '/tmp/dataset.jsonl');
      trainPromise.catch(() => {}); // prevent unhandled rejection warning
      await vi.advanceTimersByTimeAsync(700_000);

      await expect(trainPromise).rejects.toThrow('Training timed out after 10 minutes');
    });

    it('cleans up script file on timeout', async () => {
      const proc = createHangingProcess();
      spawnMock.mockReturnValue(proc);

      const { unlink } = await import('node:fs/promises');

      const trainer = new LocalTrainer({
        timeoutMs: 1000,
        pythonBin: 'python3',
        outputDir: '/tmp/ody-test',
      });

      const config = {
        datasetId: 'ds-1',
        baseModel: 'test-model',
        method: 'sft' as const,
        provider: 'local' as const,
      };

      const trainPromise = trainer.train(config, '/tmp/dataset.jsonl');
      trainPromise.catch(() => {}); // prevent unhandled rejection warning
      await vi.advanceTimersByTimeAsync(2000);

      await expect(trainPromise).rejects.toThrow('Training timed out');
      expect(unlink).toHaveBeenCalled();
    });
  });
});
