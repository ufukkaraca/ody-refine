/**
 * Tests for the Gmail connector: API client helpers, connector lifecycle,
 * and registry integration. Mocks fetch — no actual API access required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapGmailMessage } from '../src/connectors/gmail-api.js';
import type { GmailConnector as GmailConnectorType } from '../src/connectors/gmail.js';
import type { ConnectorDocument, ConnectorProgress } from '../src/connectors/types.js';

// ---------------------------------------------------------------------------
// mapGmailMessage
// ---------------------------------------------------------------------------

describe('mapGmailMessage', () => {
  it('extracts Subject, From, To from payload headers', () => {
    const result = mapGmailMessage({
      id: 'msg-1',
      threadId: 'thread-1',
      snippet: 'Hello world',
      internalDate: '1710500000000',
      payload: {
        headers: [
          { name: 'Subject', value: 'Test Email' },
          { name: 'From', value: 'alice@example.com' },
          { name: 'To', value: 'bob@example.com, carol@example.com' },
        ],
      },
    });

    expect(result.id).toBe('msg-1');
    expect(result.threadId).toBe('thread-1');
    expect(result.subject).toBe('Test Email');
    expect(result.from).toBe('alice@example.com');
    expect(result.to).toEqual(['bob@example.com', 'carol@example.com']);
    expect(result.snippet).toBe('Hello world');
    expect(result.date).toBeDefined();
  });

  it('defaults subject to "Email" when header is missing', () => {
    const result = mapGmailMessage({
      id: 'msg-2',
      threadId: 'thread-2',
      snippet: '',
      payload: { headers: [] },
    });
    expect(result.subject).toBe('Email');
    expect(result.from).toBeUndefined();
    expect(result.to).toBeUndefined();
    expect(result.date).toBeUndefined();
  });

  it('handles missing payload gracefully', () => {
    const result = mapGmailMessage({
      id: 'msg-3',
      threadId: 'thread-3',
      snippet: 'No payload',
    });
    expect(result.subject).toBe('Email');
    expect(result.snippet).toBe('No payload');
  });
});

// ---------------------------------------------------------------------------
// GmailConnector
// ---------------------------------------------------------------------------

describe('GmailConnector', () => {
  let connector: GmailConnectorType;

  async function createConnector(): Promise<GmailConnectorType> {
    const { GmailConnector } = await import('../src/connectors/gmail.js');
    return new GmailConnector();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct connector metadata', async () => {
    connector = await createConnector();
    expect(connector.name).toBe('gmail');
    expect(connector.displayName).toBe('Gmail');
    expect(connector.authMethods).toContain('oauth');
    expect(connector.supportsWriteBack).toBe(false);
  });

  it('throws ConnectorAuthError when not authenticated', async () => {
    connector = await createConnector();
    await expect(connector.listSources()).rejects.toThrow('Not authenticated');
  });

  it('validate returns false when not authenticated', async () => {
    connector = await createConnector();
    expect(await connector.validate()).toBe(false);
  });

  it('throws ConnectorAuthError when token is missing', async () => {
    connector = await createConnector();
    await expect(
      connector.authenticate({ method: 'oauth', token: '' }),
    ).rejects.toThrow('Access token is required');
  });

  it('throws ConnectorAuthError when token is invalid', async () => {
    connector = await createConnector();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      }),
    );

    await expect(
      connector.authenticate({ method: 'oauth', token: 'bad-token' }),
    ).rejects.toThrow('Invalid token');
  });

  it('authenticates successfully with a valid token', async () => {
    connector = await createConnector();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            emailAddress: 'test@gmail.com',
            messagesTotal: 100,
            threadsTotal: 50,
            historyId: '12345',
          }),
      }),
    );

    await connector.authenticate({ method: 'oauth', token: 'valid-token' });
    expect(await connector.validate()).toBe(true);
  });

  it('listSources returns labels from API', async () => {
    connector = await createConnector();
    const mockFetch = vi
      .fn()
      // auth: /profile
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            emailAddress: 'test@gmail.com',
            historyId: '123',
          }),
      })
      // listSources: /labels
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            labels: [
              { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 42 },
              { id: 'SENT', name: 'SENT', type: 'system' },
              { id: 'Label_1', name: 'Work', type: 'user', messagesTotal: 10 },
            ],
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'valid-token' });
    const sources = await connector.listSources();

    // 4 default labels + 1 user label
    expect(sources.length).toBeGreaterThanOrEqual(5);
    const inbox = sources.find((s) => s.id === 'INBOX');
    expect(inbox).toBeDefined();
    expect(inbox!.name).toBe('Inbox');
    expect(inbox!.type).toBe('label');
    expect(inbox!.estimatedDocCount).toBe(42);

    const work = sources.find((s) => s.id === 'Label_1');
    expect(work).toBeDefined();
    expect(work!.name).toBe('Work');
  });

  it('fetchDocuments yields ConnectorDocuments from messages', async () => {
    connector = await createConnector();
    const mockFetch = vi
      .fn()
      // auth: /profile
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ emailAddress: 'test@gmail.com', historyId: '1' }),
      })
      // listMessages: /messages (list IDs)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
          }),
      })
      // fetchMessageDetail: msg-1
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'msg-1',
            threadId: 'thread-1',
            snippet: 'Meeting at 3pm to discuss the quarterly results',
            internalDate: '1710500000000',
            payload: {
              headers: [
                { name: 'Subject', value: 'Quarterly Review' },
                { name: 'From', value: 'alice@example.com' },
                { name: 'To', value: 'team@example.com' },
              ],
            },
          }),
      })
      // fetchMessageDetail: msg-2
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'msg-2',
            threadId: 'thread-2',
            snippet: 'Deploy is ready for production release tomorrow',
            internalDate: '1710600000000',
            payload: {
              headers: [
                { name: 'Subject', value: 'Deploy Ready' },
                { name: 'From', value: 'bob@example.com' },
              ],
            },
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'valid-token' });

    const sources = [{ id: 'INBOX', name: 'Inbox', type: 'label' }];
    const docs: ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments(sources)) {
      docs.push(doc);
    }

    expect(docs).toHaveLength(2);

    const doc1 = docs.find((d) => d.id === 'gmail:msg:thread-1:msg-1')!;
    expect(doc1).toBeDefined();
    expect(doc1.sourceType).toBe('gmail');
    expect(doc1.title).toBe('Quarterly Review');
    expect(doc1.content).toContain('a***@example.com');
    expect(doc1.content).toContain('Meeting at 3pm');
    expect(doc1.author).toBe('a***@example.com');
    expect(doc1.sourceUrl).toContain('thread-1');
    expect(doc1.metadata['threadId']).toBe('thread-1');
    expect(doc1.metadata['labelId']).toBe('INBOX');

    const doc2 = docs.find((d) => d.id === 'gmail:msg:thread-2:msg-2')!;
    expect(doc2).toBeDefined();
    expect(doc2.title).toBe('Deploy Ready');
    expect(doc2.author).toBe('b***@example.com');
  });

  it('fetchDocuments reports progress', async () => {
    connector = await createConnector();
    const mockFetch = vi
      .fn()
      // auth
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ emailAddress: 'x', historyId: '1' }),
      })
      // list messages (empty)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ messages: [] }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'tok' });

    const events: ConnectorProgress[] = [];
    const gen = connector.fetchDocuments(
      [{ id: 'INBOX', name: 'Inbox', type: 'label' }],
      (ev) => events.push(ev),
    );
    for await (const _doc of gen) { /* consume */ }

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.phase).toBe('fetch');
    expect(events[0]!.message).toContain('Inbox');
  });

  it('fetchChanges filters messages using cursor', async () => {
    connector = await createConnector();
    const mockFetch = vi
      .fn()
      // auth
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ emailAddress: 'x', historyId: '1' }),
      })
      // list messages with after: query
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            messages: [{ id: 'msg-new' }],
          }),
      })
      // detail for msg-new
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'msg-new',
            threadId: 'thread-new',
            snippet: 'A brand new message with enough content here',
            internalDate: '1710600000000',
            payload: {
              headers: [
                { name: 'Subject', value: 'New Update' },
                { name: 'From', value: 'carol@example.com' },
              ],
            },
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'tok' });

    const cursor = {
      type: 'change-token' as const,
      value: String(Math.floor(new Date('2026-03-01T00:00:00Z').getTime() / 1000)),
      connectorName: 'gmail',
    };
    const changes: Array<{ document: ConnectorDocument; action: string }> = [];
    for await (const change of connector.fetchChanges(cursor)) {
      changes.push(change);
    }

    expect(changes).toHaveLength(1);
    expect(changes[0]!.document.id).toContain('msg-new');
    expect(changes[0]!.document.title).toBe('New Update');
    expect(changes[0]!.action).toBe('upsert');

    // Verify the query included an after: parameter
    const listCall = mockFetch.mock.calls[1]!;
    expect(listCall[0]).toContain('after%3A');
  });

  it('writeBack returns not-supported error', async () => {
    connector = await createConnector();
    const result = await connector.writeBack(
      'gmail:msg:thread-1:msg-1',
      'corrected',
      'reason',
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not supported');
  });
});

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

describe('Connector registry includes gmail', () => {
  it('getConnector returns a GmailConnector', async () => {
    const { getConnector } = await import('../src/connectors/index.js');
    const connector = getConnector('gmail');
    expect(connector.name).toBe('gmail');
    expect(connector.displayName).toBe('Gmail');
  });

  it('listConnectors includes gmail as available', async () => {
    const { listConnectors } = await import('../src/connectors/index.js');
    const all = listConnectors();
    const gmail = all.find((c) => c.name === 'gmail');
    expect(gmail).toBeDefined();
    expect(gmail!.status).toBe('available');
  });
});
