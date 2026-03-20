import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseServingUrl,
  buildServingUrl,
  buildDeployArgs,
  getServingUrl,
  DEFAULT_SERVE_APP_NAME,
} from '../src/modal-serve.js';

/** Mock child_process so we never actually shell out. */
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('modal-serve', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['MODAL_WORKSPACE'] = 'test-workspace';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('parseServingUrl', () => {
    it('extracts URL from Modal deploy output', () => {
      const output =
        'Deploying app...\n' +
        'Created web endpoint https://ws--ody-serving-v1-chat-completions.modal.run\n' +
        'Done.';
      const url = parseServingUrl(output);
      expect(url).toBe('https://ws--ody-serving-v1-chat-completions.modal.run');
    });

    it('extracts URL when it appears alone on a line', () => {
      const output = 'https://my-ws--app-fn.modal.run';
      expect(parseServingUrl(output)).toBe('https://my-ws--app-fn.modal.run');
    });

    it('returns undefined when no URL is found', () => {
      expect(parseServingUrl('no urls here')).toBeUndefined();
    });

    it('handles URLs with trailing path segments', () => {
      const output = 'View at https://ws--app-fn.modal.run/docs';
      const url = parseServingUrl(output);
      expect(url).toBe('https://ws--app-fn.modal.run/docs');
    });
  });

  describe('buildServingUrl', () => {
    it('constructs URL from workspace and default app name', () => {
      const url = buildServingUrl('my-workspace');
      expect(url).toBe(
        'https://my-workspace--ody-serving-v1-chat-completions.modal.run',
      );
    });

    it('uses custom app name when provided', () => {
      const url = buildServingUrl('ws', 'custom-app');
      expect(url).toBe(
        'https://ws--custom-app-v1-chat-completions.modal.run',
      );
    });
  });

  describe('buildDeployArgs', () => {
    it('builds basic deploy command', () => {
      const args = buildDeployArgs('/path/to/modal-serve.py');
      expect(args).toEqual(['deploy', '/path/to/modal-serve.py']);
    });

    it('includes base model env when provided', () => {
      const args = buildDeployArgs('/path/to/modal-serve.py', {
        baseModel: 'Qwen/Qwen2.5-7B-Instruct',
      });
      expect(args).toContain('--env');
      expect(args).toContain('ODY_BASE_MODEL=Qwen/Qwen2.5-7B-Instruct');
    });

    it('includes adapter path env when provided', () => {
      const args = buildDeployArgs('/path/to/modal-serve.py', {
        adapterPath: '/models/tenant-abc/adapter',
      });
      expect(args).toContain('--env');
      expect(args).toContain('ODY_ADAPTER_PATH=/models/tenant-abc/adapter');
    });

    it('includes both env vars when both are provided', () => {
      const args = buildDeployArgs('/path/to/modal-serve.py', {
        baseModel: 'Qwen/Qwen2.5-7B-Instruct',
        adapterPath: '/models/adapter',
      });
      const envIndices = args
        .map((a, i) => (a === '--env' ? i : -1))
        .filter((i) => i >= 0);
      expect(envIndices).toHaveLength(2);
    });
  });

  describe('deployServing', () => {
    it('rejects when workspace is missing', async () => {
      delete process.env['MODAL_WORKSPACE'];

      const { deployServing } = await import('../src/modal-serve.js');
      await expect(deployServing()).rejects.toThrow('Modal workspace required');
    });

    it('calls modal deploy with correct script path', async () => {
      const { execFile } = await import('node:child_process');
      const mockExecFile = vi.mocked(execFile);

      // Simulate successful deploy
      mockExecFile.mockImplementation(
        ((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          const callback = cb as (
            err: Error | null,
            stdout: string,
            stderr: string,
          ) => void;
          callback(
            null,
            'Created web endpoint https://test-workspace--ody-serving-v1-chat-completions.modal.run\n',
            '',
          );
        }) as typeof execFile,
      );

      const { deployServing } = await import('../src/modal-serve.js');
      const result = await deployServing({ workspace: 'test-workspace' });

      expect(result.url).toBe(
        'https://test-workspace--ody-serving-v1-chat-completions.modal.run',
      );
      expect(result.appName).toBe(DEFAULT_SERVE_APP_NAME);
      expect(mockExecFile).toHaveBeenCalledWith(
        'modal',
        expect.arrayContaining(['deploy']),
        expect.objectContaining({ timeout: 300_000 }),
        expect.any(Function),
      );
    });

    it('falls back to constructed URL when parsing fails', async () => {
      const { execFile } = await import('node:child_process');
      const mockExecFile = vi.mocked(execFile);

      mockExecFile.mockImplementation(
        ((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          const callback = cb as (
            err: Error | null,
            stdout: string,
            stderr: string,
          ) => void;
          callback(null, 'App deployed successfully.', '');
        }) as typeof execFile,
      );

      const { deployServing } = await import('../src/modal-serve.js');
      const result = await deployServing({ workspace: 'test-workspace' });

      expect(result.url).toBe(
        'https://test-workspace--ody-serving-v1-chat-completions.modal.run',
      );
    });

    it('rejects when modal deploy fails', async () => {
      const { execFile } = await import('node:child_process');
      const mockExecFile = vi.mocked(execFile);

      mockExecFile.mockImplementation(
        ((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          const callback = cb as (
            err: Error | null,
            stdout: string,
            stderr: string,
          ) => void;
          callback(new Error('command not found'), '', 'modal: not found');
        }) as typeof execFile,
      );

      const { deployServing } = await import('../src/modal-serve.js');
      await expect(
        deployServing({ workspace: 'test-workspace' }),
      ).rejects.toThrow('modal deploy failed');
    });
  });

  describe('getServingUrl', () => {
    it('returns expected URL for a model ID', () => {
      const url = getServingUrl('tenant-abc', {
        workspace: 'my-workspace',
      });
      expect(url).toBe(
        'https://my-workspace--ody-serving-tenant-abc-v1-chat-completions.modal.run',
      );
    });

    it('uses MODAL_WORKSPACE env var as fallback', () => {
      process.env['MODAL_WORKSPACE'] = 'env-workspace';
      const url = getServingUrl('model-1');
      expect(url).toBe(
        'https://env-workspace--ody-serving-model-1-v1-chat-completions.modal.run',
      );
    });

    it('throws when workspace is missing', () => {
      delete process.env['MODAL_WORKSPACE'];
      expect(() => getServingUrl('model-1')).toThrow(
        'Modal workspace required',
      );
    });

    it('uses custom app name when provided', () => {
      const url = getServingUrl('m1', {
        workspace: 'ws',
        appName: 'custom',
      });
      expect(url).toBe(
        'https://ws--custom-v1-chat-completions.modal.run',
      );
    });
  });
});
