import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModalClient } from '../src/modal-client.js';

describe('ModalClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['MODAL_TOKEN_ID'] = 'test-token-id';
    process.env['MODAL_TOKEN_SECRET'] = 'test-token-secret';
    process.env['MODAL_WORKSPACE'] = 'test-workspace';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('throws if credentials are missing', () => {
    delete process.env['MODAL_TOKEN_ID'];
    delete process.env['MODAL_TOKEN_SECRET'];
    expect(() => new ModalClient()).toThrow('Modal credentials required');
  });

  it('resolves credentials from env vars', () => {
    const client = new ModalClient();
    expect(client).toBeDefined();
  });

  it('accepts explicit credentials', () => {
    delete process.env['MODAL_TOKEN_ID'];
    delete process.env['MODAL_TOKEN_SECRET'];
    const client = new ModalClient({
      credentials: { tokenId: 'my-id', tokenSecret: 'my-secret' },
    });
    expect(client).toBeDefined();
  });

  it('throws if workspace is missing and no webEndpointUrl', async () => {
    delete process.env['MODAL_WORKSPACE'];
    const client = new ModalClient();
    await expect(client.callAndWait('app', 'fn', {}))
      .rejects.toThrow('Modal workspace required');
  });

  describe('callAndWait', () => {
    it('sends correct request to web endpoint URL with Modal auth headers', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ result: 'ok' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const client = new ModalClient();
      const result = await client.callAndWait('my-app', 'train', { data: 'hello' });

      expect(result.status).toBe('completed');
      expect(result.output).toContain('"result"');
      expect(fetch).toHaveBeenCalledWith(
        'https://test-workspace--my-app-train.modal.run',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Modal-Key': 'test-token-id',
            'Modal-Secret': 'test-token-secret',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('uses webEndpointUrl when provided', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ done: true }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const client = new ModalClient({
        webEndpointUrl: 'https://custom.endpoint.com/train',
      });
      await client.callAndWait('ignored', 'ignored', {});

      expect(fetch).toHaveBeenCalledWith(
        'https://custom.endpoint.com/train',
        expect.anything(),
      );
    });

    it('throws on API error with response body', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const client = new ModalClient();
      await expect(client.callAndWait('app', 'fn', {}))
        .rejects.toThrow('Modal API error (400)');
    });

    it('throws descriptive error for non-JSON response', async () => {
      const mockResponse = {
        ok: true,
        text: async () => '<html><body>502 Bad Gateway</body></html>',
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const client = new ModalClient();
      await expect(client.callAndWait('app', 'fn', {}))
        .rejects.toThrow('not valid JSON');
    });

    it('detects error field in response and returns failed status', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ error: 'OOM killed' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const client = new ModalClient();
      const result = await client.callAndWait('app', 'fn', {});

      expect(result.status).toBe('failed');
      expect(result.error).toBe('OOM killed');
    });

    it('returns completed when no error in response', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ score: 0.95, model: 'trained' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const client = new ModalClient();
      const result = await client.callAndWait('app', 'fn', { x: 1 });

      expect(result.status).toBe('completed');
      expect(result.output).toContain('0.95');
      expect(result.functionCallId).toBeTruthy();
    });
  });

  describe('createFunctionCall', () => {
    it('delegates to callAndWait and returns call info', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ status: 'done' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const client = new ModalClient();
      const result = await client.createFunctionCall('my-app', 'train', { data: 'hello' });

      expect(result.functionCallId).toBeTruthy();
      expect(result.status).toBe('completed');
    });
  });

  describe('getFunctionCallStatus', () => {
    it('returns completed for web endpoints', async () => {
      const client = new ModalClient();
      const result = await client.getFunctionCallStatus('fc-123');

      expect(result.status).toBe('completed');
      expect(result.functionCallId).toBe('fc-123');
    });
  });

  describe('waitForCompletion', () => {
    it('returns immediately for web endpoints', async () => {
      const client = new ModalClient();
      const result = await client.waitForCompletion('fc-123');

      expect(result.status).toBe('completed');
      expect(result.functionCallId).toBe('fc-123');
    });
  });
});
