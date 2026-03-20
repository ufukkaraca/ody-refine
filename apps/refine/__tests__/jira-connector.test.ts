/**
 * Tests for the Jira connector: ADF conversion, API client,
 * connector lifecycle. Mocks fetch — does not require actual API access.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { adfToPlainText } from '../src/connectors/jira-adf.js';
import type { JiraConnector as JiraConnectorType } from '../src/connectors/jira.js';
import type { ConnectorDocument, ConnectorProgress } from '../src/connectors/types.js';

// ---------------------------------------------------------------------------
// adfToPlainText
// ---------------------------------------------------------------------------

describe('adfToPlainText', () => {
  it('converts paragraphs to plain text', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
      ],
    };
    expect(adfToPlainText(doc)).toBe('Hello world');
  });

  it('converts headings with correct level', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading', attrs: { level: 2 },
          content: [{ type: 'text', text: 'Section Title' }],
        },
      ],
    };
    expect(adfToPlainText(doc)).toBe('## Section Title');
  });

  it('converts bullet lists', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item A' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item B' }] }] },
        ],
      }],
    };
    const text = adfToPlainText(doc);
    expect(text).toContain('- Item A');
    expect(text).toContain('- Item B');
  });

  it('converts code blocks', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'codeBlock', attrs: { language: 'ts' },
        content: [{ type: 'text', text: 'const x = 1;' }],
      }],
    };
    const text = adfToPlainText(doc);
    expect(text).toContain('```ts');
    expect(text).toContain('const x = 1;');
  });

  it('handles null and empty docs', () => {
    expect(adfToPlainText(null)).toBe('');
    expect(adfToPlainText(undefined)).toBe('');
    expect(adfToPlainText({ type: 'doc' })).toBe('');
  });

  it('converts mentions', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Assigned to ' },
          { type: 'mention', attrs: { text: 'Alice' } },
        ],
      }],
    };
    expect(adfToPlainText(doc)).toContain('@Alice');
  });

  it('converts tables', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'text', text: 'Name' }] },
            { type: 'tableCell', content: [{ type: 'text', text: 'Value' }] },
          ],
        }],
      }],
    };
    expect(adfToPlainText(doc)).toContain('| Name | Value |');
  });
});

// ---------------------------------------------------------------------------
// JiraConnector
// ---------------------------------------------------------------------------

describe('JiraConnector', () => {
  let connector: JiraConnectorType;

  async function createConnector(): Promise<JiraConnectorType> {
    const { JiraConnector } = await import('../src/connectors/jira.js');
    return new JiraConnector();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct connector metadata', async () => {
    connector = await createConnector();
    expect(connector.name).toBe('jira');
    expect(connector.displayName).toBe('Jira');
    expect(connector.authMethods).toContain('api-key');
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

  it('throws when api-key auth is missing baseUrl', async () => {
    connector = await createConnector();
    await expect(
      connector.authenticate({
        method: 'api-key',
        token: 'tok',
        params: { email: 'u@e.com' },
      }),
    ).rejects.toThrow('Base URL is required');
  });

  it('throws when api-key auth is missing email', async () => {
    connector = await createConnector();
    await expect(
      connector.authenticate({
        method: 'api-key',
        token: 'tok',
        params: { baseUrl: 'https://site.atlassian.net' },
      }),
    ).rejects.toThrow('Email is required');
  });

  it('throws when oauth auth is missing cloudId', async () => {
    connector = await createConnector();
    await expect(
      connector.authenticate({ method: 'oauth', token: 'access-token' }),
    ).rejects.toThrow('cloudId is required');
  });

  it('authenticates with api-key (basic auth)', async () => {
    connector = await createConnector();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ accountId: 'user-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'api-key',
      token: 'my-api-token',
      params: { baseUrl: 'https://mysite.atlassian.net', email: 'u@e.com' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('mysite.atlassian.net');
    expect(url).toContain('/rest/api/3/myself');
    const headers = mockFetch.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Basic /);
  });

  it('authenticates with oauth (bearer token)', async () => {
    connector = await createConnector();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ accountId: 'u' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'oauth', token: 'my-access-token',
      params: { cloudId: 'cloud-abc' },
    });

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('api.atlassian.com/ex/jira/cloud-abc');
    const headers = mockFetch.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-access-token');
  });

  it('throws ConnectorAuthError when credentials are invalid', async () => {
    connector = await createConnector();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, statusText: 'Unauthorized', headers: new Headers(),
    }));

    await expect(
      connector.authenticate({
        method: 'api-key', token: 'bad',
        params: { baseUrl: 'https://site.atlassian.net', email: 'u@e.com' },
      }),
    ).rejects.toThrow('Invalid credentials');
  });

  it('listSources returns projects from API', async () => {
    connector = await createConnector();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ accountId: 'u' }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve([
          { id: '1', key: 'ENG', name: 'Engineering' },
          { id: '2', key: 'PROD', name: 'Product' },
        ]),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'api-key', token: 'tok',
      params: { baseUrl: 'https://site.atlassian.net', email: 'u@e.com' },
    });

    const sources = await connector.listSources();
    expect(sources).toHaveLength(2);
    expect(sources[0]!.name).toContain('Engineering');
    expect(sources[0]!.type).toBe('project');
    expect(sources[0]!.id).toBe('ENG');
  });

  it('fetchDocuments yields ConnectorDocuments from issues', async () => {
    connector = await createConnector();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ accountId: 'u' }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({
          issues: [{
            id: '10001',
            key: 'ENG-42',
            self: 'https://site.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Fix login bug',
              status: { name: 'In Progress' },
              assignee: { displayName: 'Alice' },
              labels: ['bug', 'urgent'],
              description: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Login fails when using SSO.' }] }],
              },
              comment: {
                comments: [{
                  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Looking into it.' }] }] },
                  author: { displayName: 'Bob' },
                }],
              },
              updated: '2026-03-15T12:00:00Z',
            },
          }],
          total: 1, startAt: 0, maxResults: 50,
        }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'api-key', token: 'tok',
      params: { baseUrl: 'https://site.atlassian.net', email: 'u@e.com' },
    });

    const docs: ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments([
      { id: 'ENG', name: 'Engineering (ENG)', type: 'project' },
    ])) {
      docs.push(doc);
    }

    expect(docs).toHaveLength(1);
    const doc = docs[0]!;
    expect(doc.id).toBe('jira:issue:10001');
    expect(doc.title).toContain('ENG-42');
    expect(doc.sourceType).toBe('jira');
    expect(doc.content).toContain('Fix login bug');
    expect(doc.content).toContain('Login fails when using SSO');
    expect(doc.content).toContain('Looking into it');
    expect(doc.content).toContain('In Progress');
    expect(doc.sourceUrl).toContain('/browse/ENG-42');
    expect(doc.author).toBe('Alice');
    expect(doc.metadata['issueKey']).toBe('ENG-42');
  });

  it('writeBack returns not-implemented error', async () => {
    connector = await createConnector();
    const result = await connector.writeBack('jira:issue:1', 'new', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet implemented');
  });

  it('reports progress during fetchDocuments', async () => {
    connector = await createConnector();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ accountId: 'u' }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ issues: [], total: 0, startAt: 0, maxResults: 50 }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'api-key', token: 'tok',
      params: { baseUrl: 'https://s.atlassian.net', email: 'u@e.com' },
    });

    const events: ConnectorProgress[] = [];
    const gen = connector.fetchDocuments(
      [{ id: 'ENG', name: 'Eng', type: 'project' }],
      (ev) => events.push(ev),
    );
    for await (const _doc of gen) { /* consume */ }

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.phase).toBe('fetch');
  });
});

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

describe('Connector registry includes jira', () => {
  it('getConnector returns a JiraConnector', async () => {
    const { getConnector } = await import('../src/connectors/index.js');
    const connector = getConnector('jira');
    expect(connector.name).toBe('jira');
    expect(connector.displayName).toBe('Jira');
  });

  it('listConnectors includes jira as available', async () => {
    const { listConnectors } = await import('../src/connectors/index.js');
    const all = listConnectors();
    const jira = all.find((c) => c.name === 'jira');
    expect(jira).toBeDefined();
    expect(jira!.status).toBe('available');
  });
});
