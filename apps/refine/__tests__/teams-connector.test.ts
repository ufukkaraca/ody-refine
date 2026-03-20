/**
 * Tests for the Microsoft Teams connector: HTML-to-text, API client,
 * connector lifecycle. Mocks fetch — does not require actual API access.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { teamsHtmlToText } from '../src/connectors/teams-html.js';
import type { TeamsConnector as TeamsConnectorType } from '../src/connectors/teams.js';
import type { ConnectorDocument, ConnectorProgress } from '../src/connectors/types.js';

// ---------------------------------------------------------------------------
// teamsHtmlToText
// ---------------------------------------------------------------------------

describe('teamsHtmlToText', () => {
  it('strips basic HTML tags and returns plain text', () => {
    expect(teamsHtmlToText('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('converts <at> mentions to @name', () => {
    expect(teamsHtmlToText('<at id="123">Alice</at>')).toBe('@Alice');
  });

  it('converts <a> tags to markdown links', () => {
    const html = '<a href="https://example.com">click here</a>';
    expect(teamsHtmlToText(html)).toBe('[click here](https://example.com)');
  });

  it('converts <br> to newlines', () => {
    expect(teamsHtmlToText('line1<br/>line2')).toBe('line1\nline2');
  });

  it('converts list items to dashes', () => {
    const html = '<ul><li>one</li><li>two</li></ul>';
    const text = teamsHtmlToText(html);
    expect(text).toContain('- one');
    expect(text).toContain('- two');
  });

  it('decodes HTML entities', () => {
    expect(teamsHtmlToText('&amp; &lt; &gt; &quot; &#39;')).toBe('& < > " \'');
  });

  it('replaces <attachment> with placeholder', () => {
    expect(teamsHtmlToText('<attachment id="x">file</attachment>')).toBe(
      '[attachment]',
    );
  });

  it('handles empty input', () => {
    expect(teamsHtmlToText('')).toBe('');
  });

  it('collapses excessive newlines', () => {
    const html = '<p>A</p>\n\n\n\n<p>B</p>';
    expect(teamsHtmlToText(html)).not.toContain('\n\n\n');
  });
});

// ---------------------------------------------------------------------------
// TeamsConnector
// ---------------------------------------------------------------------------

describe('TeamsConnector', () => {
  let connector: TeamsConnectorType;

  async function createConnector(): Promise<TeamsConnectorType> {
    const { TeamsConnector } = await import('../src/connectors/teams.js');
    return new TeamsConnector();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct connector metadata', async () => {
    connector = await createConnector();
    expect(connector.name).toBe('teams');
    expect(connector.displayName).toBe('Microsoft Teams');
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
        headers: new Headers(),
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
        json: () => Promise.resolve({ id: 'user-123' }),
      }),
    );

    await connector.authenticate({ method: 'oauth', token: 'valid-token' });
    expect(await connector.validate()).toBe(true);
  });

  it('listSources returns teams from API', async () => {
    connector = await createConnector();
    const mockFetch = vi
      .fn()
      // auth: /me
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-123' }),
      })
      // listSources: /me/joinedTeams
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: [
              { id: 't1', displayName: 'Engineering', description: null },
              { id: 't2', displayName: 'Product', description: 'Product team' },
            ],
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'valid-token' });
    const sources = await connector.listSources();

    expect(sources).toHaveLength(2);
    expect(sources[0]!.id).toBe('t1');
    expect(sources[0]!.name).toBe('Engineering');
    expect(sources[0]!.type).toBe('team');
    expect(sources[1]!.name).toBe('Product');
  });

  it('fetchDocuments yields ConnectorDocuments from messages', async () => {
    connector = await createConnector();
    const mockFetch = vi
      .fn()
      // auth: /me
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-123' }),
      })
      // fetchChannels: /teams/t1/channels
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: [
              { id: 'ch1', displayName: 'General', description: null },
            ],
          }),
      })
      // fetchChannelMessages: delta
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: [
              {
                id: 'msg-1',
                messageType: 'message',
                body: { content: 'We need to fix the pipeline', contentType: 'text' },
                from: { user: { displayName: 'Alice', id: 'u1' } },
                createdDateTime: '2026-03-15T10:00:00Z',
                webUrl: 'https://teams.microsoft.com/msg/1',
              },
              {
                id: 'msg-2',
                messageType: 'message',
                body: { content: '<p>Deploy is <b>blocked</b></p>', contentType: 'html' },
                from: { user: { displayName: 'Bob', id: 'u2' } },
                createdDateTime: '2026-03-15T10:05:00Z',
              },
              {
                id: 'msg-skip',
                messageType: 'systemEventMessage',
                body: { content: 'User joined', contentType: 'text' },
                createdDateTime: '2026-03-15T10:06:00Z',
              },
            ],
            '@odata.deltaLink': 'https://graph.microsoft.com/delta?token=abc',
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'valid-token' });

    const sources = [{ id: 't1', name: 'Engineering', type: 'team' }];
    const docs: ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments(sources)) {
      docs.push(doc);
    }

    expect(docs).toHaveLength(2);

    const doc1 = docs[0]!;
    expect(doc1.id).toBe('teams:msg:t1:ch1:msg-1');
    expect(doc1.sourceType).toBe('teams');
    expect(doc1.content).toContain('We need to fix the pipeline');
    expect(doc1.title).toContain('General');
    expect(doc1.author).toBe('Alice');
    expect(doc1.sourceUrl).toBe('https://teams.microsoft.com/msg/1');
    expect(doc1.metadata['teamId']).toBe('t1');
    expect(doc1.metadata['channelId']).toBe('ch1');

    const doc2 = docs[1]!;
    expect(doc2.id).toBe('teams:msg:t1:ch1:msg-2');
    expect(doc2.content).toContain('Deploy is blocked');
    expect(doc2.author).toBe('Bob');
  });

  it('fetchDocuments reports progress', async () => {
    connector = await createConnector();
    const mockFetch = vi
      .fn()
      // auth
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'u' }),
      })
      // channels
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [] }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'tok' });

    const events: ConnectorProgress[] = [];
    const gen = connector.fetchDocuments(
      [{ id: 't1', name: 'Eng', type: 'team' }],
      (ev) => events.push(ev),
    );
    for await (const _doc of gen) {
      /* consume */
    }

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.phase).toBe('fetch');
    expect(events[0]!.message).toContain('Eng');
  });

  it('fetchChanges filters messages using cursor', async () => {
    connector = await createConnector();
    const mockFetch = vi
      .fn()
      // auth
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'u' }),
      })
      // fetchTeams
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: [{ id: 't1', displayName: 'Team', description: null }],
          }),
      })
      // fetchChannels
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: [{ id: 'ch1', displayName: 'General', description: null }],
          }),
      })
      // fetchChannelMessages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: [
              {
                id: 'old-msg',
                messageType: 'message',
                body: { content: 'Old message content here', contentType: 'text' },
                from: { user: { displayName: 'Alice', id: 'u1' } },
                createdDateTime: '2026-01-01T00:00:00Z',
              },
              {
                id: 'new-msg',
                messageType: 'message',
                body: { content: 'New message content here', contentType: 'text' },
                from: { user: { displayName: 'Bob', id: 'u2' } },
                createdDateTime: '2026-03-16T12:00:00Z',
              },
            ],
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'tok' });

    const cursor = {
      type: 'timestamp' as const,
      value: '2026-03-01T00:00:00Z',
      connectorName: 'teams',
    };
    const changes: Array<{ document: ConnectorDocument; action: string }> = [];
    for await (const change of connector.fetchChanges(cursor)) {
      changes.push(change);
    }

    expect(changes).toHaveLength(1);
    expect(changes[0]!.document.id).toContain('new-msg');
    expect(changes[0]!.action).toBe('upsert');
  });

  it('writeBack returns not-implemented error', async () => {
    connector = await createConnector();
    const result = await connector.writeBack(
      'teams:msg:t1:ch1:msg-1',
      'corrected',
      'reason',
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet implemented');
  });
});

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

describe('Connector registry includes teams', () => {
  it('getConnector returns a TeamsConnector', async () => {
    const { getConnector } = await import('../src/connectors/index.js');
    const connector = getConnector('teams');
    expect(connector.name).toBe('teams');
    expect(connector.displayName).toBe('Microsoft Teams');
  });

  it('listConnectors includes teams as available', async () => {
    const { listConnectors } = await import('../src/connectors/index.js');
    const all = listConnectors();
    const teams = all.find((c) => c.name === 'teams');
    expect(teams).toBeDefined();
    expect(teams!.status).toBe('available');
  });
});
