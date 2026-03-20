/**
 * Tests for Gmail connector hardening: retry logic, token refresh, PII redaction.
 * Mocks fetch — no actual API access required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GmailApiClient } from '../src/connectors/gmail-api.js';
import type { GmailRefreshConfig } from '../src/connectors/gmail-api.js';
import { redactEmail } from '../src/connectors/gmail.js';
import type { ConnectorDocument } from '../src/connectors/types.js';

const profileOk = {
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      emailAddress: 'test@gmail.com',
      messagesTotal: 100,
      threadsTotal: 50,
      historyId: '12345',
    }),
};

const mock429 = {
  ok: false,
  status: 429,
  statusText: 'Too Many Requests',
  headers: { get: (n: string): string | null => (n === 'Retry-After' ? '0' : null) },
};

const mock500 = {
  ok: false,
  status: 500,
  statusText: 'Internal Server Error',
  headers: { get: (): null => null },
};

const mock401 = {
  ok: false,
  status: 401,
  statusText: 'Unauthorized',
  headers: { get: (): null => null },
};

// ---------------------------------------------------------------------------
// redactEmail
// ---------------------------------------------------------------------------

describe('redactEmail', () => {
  it('redacts a bare email address', () => {
    expect(redactEmail('alice@example.com')).toBe('a***@example.com');
  });

  it('redacts email in display name format', () => {
    expect(redactEmail('Alice Smith <alice@example.com>')).toBe(
      'Alice Smith <a***@example.com>',
    );
  });

  it('redacts multiple email addresses', () => {
    expect(redactEmail('alice@example.com, bob@example.com')).toBe(
      'a***@example.com, b***@example.com',
    );
  });

  it('handles single-char local part', () => {
    expect(redactEmail('a@example.com')).toBe('a***@example.com');
  });

  it('passes through non-email strings unchanged', () => {
    expect(redactEmail('not an email')).toBe('not an email');
  });

  it('handles dotted local parts', () => {
    expect(redactEmail('alice.smith@example.com')).toBe('a***@example.com');
  });
});

// ---------------------------------------------------------------------------
// GmailApiClient — retry on 429
// ---------------------------------------------------------------------------

describe('GmailApiClient retry on 429', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries after 429 with Retry-After header', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mock429)
      .mockResolvedValueOnce(profileOk);
    vi.stubGlobal('fetch', mockFetch);

    const client = new GmailApiClient('test-token');
    const profile = await client.fetchProfile();
    expect(profile.emailAddress).toBe('test@gmail.com');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mock429));

    const client = new GmailApiClient('test-token');
    await expect(client.fetchProfile()).rejects.toThrow('Max retries exceeded');
  });
});

// ---------------------------------------------------------------------------
// GmailApiClient — exponential backoff on 500
// ---------------------------------------------------------------------------

describe('GmailApiClient exponential backoff on 500', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries with backoff then succeeds', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mock500)
      .mockResolvedValueOnce(profileOk);
    vi.stubGlobal('fetch', mockFetch);

    const client = new GmailApiClient('test-token');
    const profile = await client.fetchProfile();
    expect(profile.emailAddress).toBe('test@gmail.com');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('throws after exhausting retries on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mock500));

    const client = new GmailApiClient('test-token');
    await expect(client.fetchProfile()).rejects.toThrow('HTTP 500');
  }, 15_000);
});

// ---------------------------------------------------------------------------
// GmailApiClient — OAuth token refresh on 401
// ---------------------------------------------------------------------------

describe('GmailApiClient OAuth token refresh on 401', () => {
  afterEach(() => vi.unstubAllGlobals());

  const refreshCfg: GmailRefreshConfig = {
    refreshToken: 'refresh-tok',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  };

  it('refreshes token and retries on 401', async () => {
    let apiCallCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'new-token' }),
        });
      }
      apiCallCount++;
      if (apiCallCount === 1) return Promise.resolve(mock401);
      return Promise.resolve(profileOk);
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GmailApiClient('expired-token', refreshCfg);
    const profile = await client.fetchProfile();
    expect(profile.emailAddress).toBe('test@gmail.com');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws 401 when refresh fails', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
        });
      }
      return Promise.resolve(mock401);
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GmailApiClient('expired-token', refreshCfg);
    await expect(client.fetchProfile()).rejects.toThrow('401');
  });

  it('throws 401 immediately without refresh config', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mock401));

    const client = new GmailApiClient('bad-token');
    await expect(client.fetchProfile()).rejects.toThrow('401');
  });

  it('uses refreshed token in subsequent requests', async () => {
    let apiCallCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'refreshed-token' }),
        });
      }
      apiCallCount++;
      if (apiCallCount === 1) return Promise.resolve(mock401);
      // Verify the refreshed token is used
      const authHeader = (opts?.headers as Record<string, string>)?.['Authorization'];
      expect(authHeader).toBe('Bearer refreshed-token');
      return Promise.resolve(profileOk);
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GmailApiClient('old-token', refreshCfg);
    await client.fetchProfile();
  });
});

// ---------------------------------------------------------------------------
// PII redaction in documents
// ---------------------------------------------------------------------------

describe('GmailConnector PII redaction in documents', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('redacts email addresses in document content by default', async () => {
    const { GmailConnector } = await import('../src/connectors/gmail.js');
    const connector = new GmailConnector();
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(profileOk)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg-1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg-1',
            threadId: 'thread-1',
            snippet: 'Hello from the other side of email',
            internalDate: '1710500000000',
            payload: {
              headers: [
                { name: 'Subject', value: 'Test Redaction' },
                { name: 'From', value: 'alice@example.com' },
                { name: 'To', value: 'bob@example.com' },
              ],
            },
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'tok' });
    const docs: ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments([
      { id: 'INBOX', name: 'Inbox', type: 'label' },
    ])) {
      docs.push(doc);
    }

    expect(docs).toHaveLength(1);
    expect(docs[0]!.content).toContain('a***@example.com');
    expect(docs[0]!.content).not.toContain('alice@example.com');
    expect(docs[0]!.content).toContain('b***@example.com');
    expect(docs[0]!.author).toBe('a***@example.com');
    // Raw values preserved in metadata
    expect(docs[0]!.metadata['from']).toBe('alice@example.com');
    expect(docs[0]!.metadata['to']).toEqual(['bob@example.com']);
  });

  it('skips redaction when redactPii param is false', async () => {
    const { GmailConnector } = await import('../src/connectors/gmail.js');
    const connector = new GmailConnector();
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(profileOk)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg-1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg-1',
            threadId: 'thread-1',
            snippet: 'Hello from the other side of email',
            internalDate: '1710500000000',
            payload: {
              headers: [
                { name: 'Subject', value: 'Test No Redaction' },
                { name: 'From', value: 'alice@example.com' },
              ],
            },
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'oauth',
      token: 'tok',
      params: { redactPii: 'false' },
    });
    const docs: ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments([
      { id: 'INBOX', name: 'Inbox', type: 'label' },
    ])) {
      docs.push(doc);
    }

    expect(docs[0]!.content).toContain('alice@example.com');
    expect(docs[0]!.author).toBe('alice@example.com');
  });
});
