/**
 * Tests for cursor-based incremental sync across all connectors.
 * Validates getInitialCursor() and fetchChanges() for each connector.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SyncCursor, SyncChange } from '../src/connectors/types.js';

// ---------------------------------------------------------------------------
// Helper: collect all changes from an async generator
// ---------------------------------------------------------------------------
async function collectChanges(
  gen: AsyncGenerator<SyncChange, void, unknown>,
): Promise<SyncChange[]> {
  const changes: SyncChange[] = [];
  for await (const change of gen) changes.push(change);
  return changes;
}

// ---------------------------------------------------------------------------
// NotionConnector cursor
// ---------------------------------------------------------------------------

describe('NotionConnector cursor sync', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('getInitialCursor returns a timestamp cursor for notion', async () => {
    const { NotionConnector } = await import('../src/connectors/notion.js');
    const conn = new NotionConnector();
    const cursor = conn.getInitialCursor();

    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('notion');
    expect(cursor.updatedAt).toBeDefined();
    expect(new Date(cursor.value).getTime()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SlackConnector cursor
// ---------------------------------------------------------------------------

describe('SlackConnector cursor sync', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('getInitialCursor returns a timestamp cursor for slack', async () => {
    const { SlackConnector } = await import('../src/connectors/slack.js');
    const conn = new SlackConnector();
    const cursor = conn.getInitialCursor();

    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('slack');
    expect(parseFloat(cursor.value)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// LinearConnector cursor
// ---------------------------------------------------------------------------

describe('LinearConnector cursor sync', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('getInitialCursor returns a timestamp cursor for linear', async () => {
    const { LinearConnector } = await import('../src/connectors/linear.js');
    const conn = new LinearConnector();
    const cursor = conn.getInitialCursor();

    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('linear');
    expect(new Date(cursor.value).getTime()).toBeGreaterThan(0);
  });

  it('fetchChanges yields upsert changes with cursor', async () => {
    const { LinearConnector } = await import('../src/connectors/linear.js');
    const conn = new LinearConnector();

    const fetchMock = vi.fn()
      // auth
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: { viewer: { id: 'u1', name: 'Test', email: 't@t.com' } },
        }),
      })
      // fetchIssues
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [{
                id: 'i1', identifier: 'ENG-1', title: 'Fix cursor sync bug',
                description: 'The cursor sync is not working correctly in all connectors.',
                url: 'https://linear.app/issue/ENG-1',
                updatedAt: '2026-03-20T10:00:00Z',
                state: { name: 'In Progress' },
                assignee: { name: 'Alice' },
                labels: { nodes: [] },
                comments: { nodes: [] },
                project: null,
              }],
            },
          },
        }),
      })
      // fetchDocuments
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: {
            documents: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await conn.authenticate({ method: 'api-key', token: 'lin_test' });

    const cursor: SyncCursor = {
      type: 'timestamp',
      value: '2026-03-19T00:00:00Z',
      connectorName: 'linear',
    };
    const changes = await collectChanges(conn.fetchChanges(cursor));

    expect(changes).toHaveLength(1);
    expect(changes[0]!.action).toBe('upsert');
    expect(changes[0]!.document.id).toBe('linear:issue:i1');
  });
});

// ---------------------------------------------------------------------------
// ConfluenceConnector cursor
// ---------------------------------------------------------------------------

describe('ConfluenceConnector cursor sync', () => {
  it('getInitialCursor returns a timestamp cursor for confluence', async () => {
    const { ConfluenceConnector } = await import(
      '../src/connectors/confluence.js'
    );
    const conn = new ConfluenceConnector();
    const cursor = conn.getInitialCursor();

    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('confluence');
  });
});

// ---------------------------------------------------------------------------
// JiraConnector cursor
// ---------------------------------------------------------------------------

describe('JiraConnector cursor sync', () => {
  it('getInitialCursor returns a timestamp cursor for jira', async () => {
    const { JiraConnector } = await import('../src/connectors/jira.js');
    const conn = new JiraConnector();
    const cursor = conn.getInitialCursor();

    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('jira');
  });
});

// ---------------------------------------------------------------------------
// TeamsConnector cursor
// ---------------------------------------------------------------------------

describe('TeamsConnector cursor sync', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('getInitialCursor returns a timestamp cursor for teams', async () => {
    const { TeamsConnector } = await import('../src/connectors/teams.js');
    const conn = new TeamsConnector();
    const cursor = conn.getInitialCursor();

    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('teams');
  });

  it('fetchChanges filters messages after cursor timestamp', async () => {
    const { TeamsConnector } = await import('../src/connectors/teams.js');
    const conn = new TeamsConnector();

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: 'u' }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({
          value: [{ id: 't1', displayName: 'Team', description: null }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({
          value: [{ id: 'ch1', displayName: 'General', description: null }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({
          value: [
            {
              id: 'old-msg', messageType: 'message',
              body: { content: 'Old message content here', contentType: 'text' },
              from: { user: { displayName: 'Alice', id: 'u1' } },
              createdDateTime: '2026-01-01T00:00:00Z',
            },
            {
              id: 'new-msg', messageType: 'message',
              body: { content: 'New message content here', contentType: 'text' },
              from: { user: { displayName: 'Bob', id: 'u2' } },
              createdDateTime: '2026-03-16T12:00:00Z',
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await conn.authenticate({ method: 'oauth', token: 'tok' });

    const cursor: SyncCursor = {
      type: 'timestamp',
      value: '2026-03-01T00:00:00Z',
      connectorName: 'teams',
    };
    const changes = await collectChanges(conn.fetchChanges(cursor));

    expect(changes).toHaveLength(1);
    expect(changes[0]!.action).toBe('upsert');
    expect(changes[0]!.document.id).toContain('new-msg');
  });
});

// ---------------------------------------------------------------------------
// GmailConnector cursor
// ---------------------------------------------------------------------------

describe('GmailConnector cursor sync', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('getInitialCursor returns a change-token cursor for gmail', async () => {
    const { GmailConnector } = await import('../src/connectors/gmail.js');
    const conn = new GmailConnector();
    const cursor = conn.getInitialCursor();

    expect(cursor.type).toBe('change-token');
    expect(cursor.connectorName).toBe('gmail');
    expect(parseInt(cursor.value, 10)).toBeGreaterThan(0);
  });

  it('fetchChanges uses cursor value in query', async () => {
    const { GmailConnector } = await import('../src/connectors/gmail.js');
    const conn = new GmailConnector();

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ emailAddress: 'x', historyId: '1' }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({
          messages: [{ id: 'msg-new' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({
          id: 'msg-new', threadId: 'thread-new',
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

    await conn.authenticate({ method: 'oauth', token: 'tok' });

    const cursor: SyncCursor = {
      type: 'change-token',
      value: '1709251200',
      connectorName: 'gmail',
    };
    const changes = await collectChanges(conn.fetchChanges(cursor));

    expect(changes).toHaveLength(1);
    expect(changes[0]!.action).toBe('upsert');
    expect(changes[0]!.document.title).toBe('New Update');

    // Verify query included the cursor value
    const listCall = mockFetch.mock.calls[1]!;
    expect(listCall[0]).toContain('after%3A1709251200');
  });
});
