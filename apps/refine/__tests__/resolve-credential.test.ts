/**
 * Tests for resolveConnectorToken — verifies the credential resolution chain:
 * explicit token > stored credential (keychain/file) > env var.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

// Mock credential-store to isolate from real keychain
vi.mock('../src/connectors/credential-store.js', () => ({
  getCredential: vi.fn().mockResolvedValue(null),
  storeCredential: vi.fn(),
  removeCredential: vi.fn(),
}));

import { resolveConnectorToken } from '../src/connectors/resolve-credential.js';
import { getCredential } from '../src/connectors/credential-store.js';

const mockedGetCredential = vi.mocked(getCredential);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveConnectorToken', () => {
  it('returns explicit token when provided', async () => {
    const result = await resolveConnectorToken('notion', 'explicit-tok');
    expect(result).not.toBeNull();
    expect(result!.token).toBe('explicit-tok');
    expect(result!.source).toBe('explicit');
  });

  it('returns stored credential when no explicit token', async () => {
    mockedGetCredential.mockResolvedValueOnce({
      provider: 'notion',
      accessToken: 'stored-notion-token',
      connectedAt: new Date().toISOString(),
    });

    const result = await resolveConnectorToken('notion');
    expect(result).not.toBeNull();
    expect(result!.token).toBe('stored-notion-token');
    expect(result!.method).toBe('oauth');
    expect(result!.source).toBe('stored');
  });

  it('falls back to env var when no explicit or stored token', async () => {
    const orig = process.env['NOTION_TOKEN'];
    process.env['NOTION_TOKEN'] = 'env-notion-token';
    try {
      const result = await resolveConnectorToken('notion');
      expect(result).not.toBeNull();
      expect(result!.token).toBe('env-notion-token');
      expect(result!.source).toBe('env');
    } finally {
      if (orig !== undefined) {
        process.env['NOTION_TOKEN'] = orig;
      } else {
        delete process.env['NOTION_TOKEN'];
      }
    }
  });

  it('returns null when no token is available', async () => {
    const orig = process.env['NOTION_TOKEN'];
    delete process.env['NOTION_TOKEN'];
    try {
      const result = await resolveConnectorToken('notion');
      expect(result).toBeNull();
    } finally {
      if (orig !== undefined) {
        process.env['NOTION_TOKEN'] = orig;
      }
    }
  });

  it('explicit token takes priority over stored credential', async () => {
    mockedGetCredential.mockResolvedValueOnce({
      provider: 'slack',
      accessToken: 'stored-slack-token',
      connectedAt: new Date().toISOString(),
    });

    const result = await resolveConnectorToken('slack', 'explicit-slack');
    expect(result).not.toBeNull();
    expect(result!.token).toBe('explicit-slack');
    expect(result!.source).toBe('explicit');
    // getCredential should not even be called
    expect(mockedGetCredential).not.toHaveBeenCalled();
  });

  it('stored credential takes priority over env var', async () => {
    mockedGetCredential.mockResolvedValueOnce({
      provider: 'slack',
      accessToken: 'stored-slack-token',
      connectedAt: new Date().toISOString(),
    });

    const orig = process.env['SLACK_BOT_TOKEN'];
    process.env['SLACK_BOT_TOKEN'] = 'env-slack-token';
    try {
      const result = await resolveConnectorToken('slack');
      expect(result).not.toBeNull();
      expect(result!.token).toBe('stored-slack-token');
      expect(result!.source).toBe('stored');
    } finally {
      if (orig !== undefined) {
        process.env['SLACK_BOT_TOKEN'] = orig;
      } else {
        delete process.env['SLACK_BOT_TOKEN'];
      }
    }
  });

  it('works for all connectors with env vars', async () => {
    const orig = process.env['LINEAR_API_KEY'];
    process.env['LINEAR_API_KEY'] = 'linear-key';
    try {
      const result = await resolveConnectorToken('linear');
      expect(result).not.toBeNull();
      expect(result!.token).toBe('linear-key');
      expect(result!.method).toBe('api-key');
    } finally {
      if (orig !== undefined) {
        process.env['LINEAR_API_KEY'] = orig;
      } else {
        delete process.env['LINEAR_API_KEY'];
      }
    }
  });
});
