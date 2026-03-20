/**
 * Tests for the Confluence connector: storage-to-markdown, API client,
 * connector lifecycle. Mocks fetch — does not require actual API access.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { confluenceStorageToMarkdown } from '../src/connectors/confluence-api.js';
import type { ConfluenceConnector as ConfluenceConnectorType } from '../src/connectors/confluence.js';

// ---------------------------------------------------------------------------
// confluenceStorageToMarkdown
// ---------------------------------------------------------------------------

describe('confluenceStorageToMarkdown', () => {
  it('converts headings to markdown', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).toContain('# Title');
    expect(md).toContain('## Subtitle');
    expect(md).toContain('### Section');
  });

  it('converts paragraphs to plain text', () => {
    const html = '<p>Hello world</p><p>Second paragraph</p>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).toContain('Hello world');
    expect(md).toContain('Second paragraph');
  });

  it('converts unordered lists', () => {
    const html = '<ul><li>Item A</li><li>Item B</li></ul>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).toContain('- Item A');
    expect(md).toContain('- Item B');
  });

  it('converts links to markdown links', () => {
    const html = '<a href="https://example.com">Click here</a>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).toContain('[Click here](https://example.com)');
  });

  it('converts code blocks from Confluence macros', () => {
    const html =
      '<ac:structured-macro ac:name="code"><ac:plain-text-body>' +
      '<![CDATA[const x = 1;]]>' +
      '</ac:plain-text-body></ac:structured-macro>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).toContain('```');
    expect(md).toContain('const x = 1;');
  });

  it('strips table-of-contents macros', () => {
    const html =
      '<ac:structured-macro ac:name="toc"><ac:parameter>test</ac:parameter></ac:structured-macro>' +
      '<p>Real content</p>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).not.toContain('toc');
    expect(md).toContain('Real content');
  });

  it('converts Confluence page links', () => {
    const html =
      '<ac:link><ri:page ri:content-title="Setup Guide"/></ac:link>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).toContain('[Setup Guide]');
  });

  it('converts tables to pipe format', () => {
    const html =
      '<table><tr><th>Name</th><th>Value</th></tr>' +
      '<tr><td>Foo</td><td>Bar</td></tr></table>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).toContain('| Name | Value |');
    expect(md).toContain('| Foo | Bar |');
  });

  it('decodes HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot;</p>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).toContain('A & B < C > D "E"');
  });

  it('collapses excessive newlines', () => {
    const html = '<p>A</p><p></p><p></p><p></p><p>B</p>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it('handles empty input', () => {
    expect(confluenceStorageToMarkdown('')).toBe('');
  });

  it('strips remaining unknown tags', () => {
    const html = '<p>Text with <span class="highlight">styled</span> content</p>';
    const md = confluenceStorageToMarkdown(html);
    expect(md).toContain('Text with styled content');
    expect(md).not.toContain('<span');
  });
});

// ---------------------------------------------------------------------------
// ConfluenceConnector
// ---------------------------------------------------------------------------

describe('ConfluenceConnector', () => {
  let connector: ConfluenceConnectorType;

  beforeEach(async () => {
    const { ConfluenceConnector } = await import(
      '../src/connectors/confluence.js'
    );
    connector = new ConfluenceConnector();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct connector metadata', () => {
    expect(connector.name).toBe('confluence');
    expect(connector.displayName).toBe('Confluence');
    expect(connector.authMethods).toContain('api-key');
    expect(connector.authMethods).toContain('oauth');
    expect(connector.supportsWriteBack).toBe(false);
  });

  it('throws ConnectorAuthError when not authenticated', async () => {
    await expect(connector.listSources()).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('validate returns false when not authenticated', async () => {
    expect(await connector.validate()).toBe(false);
  });

  it('writeBack returns not-implemented error', async () => {
    const result = await connector.writeBack(
      'confluence:page:12345',
      'corrected content',
      'typo fix',
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet implemented');
  });

  it('throws when api-key auth is missing baseUrl', async () => {
    await expect(
      connector.authenticate({
        method: 'api-key',
        token: 'my-token',
        params: { email: 'user@example.com' },
      }),
    ).rejects.toThrow('Base URL is required');
  });

  it('throws when api-key auth is missing email', async () => {
    await expect(
      connector.authenticate({
        method: 'api-key',
        token: 'my-token',
        params: { baseUrl: 'https://site.atlassian.net' },
      }),
    ).rejects.toThrow('Email is required');
  });

  it('throws when oauth auth is missing cloudId', async () => {
    await expect(
      connector.authenticate({
        method: 'oauth',
        token: 'access-token',
      }),
    ).rejects.toThrow('cloudId is required');
  });

  it('authenticates with api-key (basic auth) and validates', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ accountId: 'user-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'api-key',
      token: 'my-api-token',
      params: {
        baseUrl: 'https://mysite.atlassian.net',
        email: 'user@example.com',
      },
    });

    // Verify the auth call was made with Basic auth header
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0]!;
    const url = callArgs[0] as string;
    expect(url).toContain('mysite.atlassian.net');
    expect(url).toContain('/wiki/rest/api/user/current');
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Basic /);
  });

  it('authenticates with oauth (bearer token)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ accountId: 'user-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'oauth',
      token: 'my-access-token',
      params: { cloudId: 'cloud-abc-123' },
    });

    const callArgs = mockFetch.mock.calls[0]!;
    const url = callArgs[0] as string;
    expect(url).toContain('api.atlassian.com/ex/confluence/cloud-abc-123');
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-access-token');
  });

  it('throws ConnectorAuthError when credentials are invalid', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      connector.authenticate({
        method: 'api-key',
        token: 'bad-token',
        params: {
          baseUrl: 'https://mysite.atlassian.net',
          email: 'user@example.com',
        },
      }),
    ).rejects.toThrow('Invalid credentials');
  });

  it('listSources returns spaces from API', async () => {
    const mockFetch = vi
      .fn()
      // auth call
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      // fetchSpaces call
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [
              { id: 's1', key: 'ENG', name: 'Engineering', type: 'global' },
              { id: 's2', key: 'PROD', name: 'Product', type: 'global' },
            ],
            _links: {},
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'api-key',
      token: 'my-token',
      params: {
        baseUrl: 'https://mysite.atlassian.net',
        email: 'user@example.com',
      },
    });

    const sources = await connector.listSources();
    expect(sources).toHaveLength(2);
    expect(sources[0]!.name).toBe('Engineering');
    expect(sources[0]!.type).toBe('space');
    expect(sources[1]!.name).toBe('Product');
  });

  it('fetchDocuments yields ConnectorDocuments from pages', async () => {
    const pageHtml =
      '<h1>Getting Started</h1><p>This is the setup guide for our platform.</p>';
    const mockFetch = vi
      .fn()
      // auth
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      // fetchPages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 'p1',
                title: 'Getting Started',
                spaceId: 's1',
                status: 'current',
                version: {
                  number: 3,
                  createdAt: '2026-01-15T10:00:00Z',
                },
                body: { storage: { value: pageHtml } },
                _links: { webui: '/wiki/spaces/ENG/pages/p1' },
              },
            ],
            _links: {},
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'api-key',
      token: 'my-token',
      params: {
        baseUrl: 'https://mysite.atlassian.net',
        email: 'user@example.com',
      },
    });

    const sources = [{ id: 's1', name: 'Engineering', type: 'space' }];
    const docs: import('../src/connectors/types.js').ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments(sources)) {
      docs.push(doc);
    }

    expect(docs).toHaveLength(1);
    const doc = docs[0]!;
    expect(doc.id).toBe('confluence:page:p1');
    expect(doc.title).toBe('Getting Started');
    expect(doc.sourceType).toBe('confluence');
    expect(doc.content).toContain('# Getting Started');
    expect(doc.content).toContain('setup guide');
    expect(doc.sourceUrl).toContain('mysite.atlassian.net');
    expect(doc.lastModified).toBeInstanceOf(Date);
    expect(doc.metadata['spaceId']).toBe('s1');
    expect(doc.metadata['version']).toBe(3);
  });

  it('fetchDocuments skips pages with very short content', async () => {
    const mockFetch = vi
      .fn()
      // auth
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      // fetchPages - page with tiny content
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 'p-empty',
                title: 'Empty',
                spaceId: 's1',
                status: 'current',
                body: { storage: { value: '<p>Hi</p>' } },
                _links: {},
              },
            ],
            _links: {},
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'api-key',
      token: 'my-token',
      params: {
        baseUrl: 'https://mysite.atlassian.net',
        email: 'user@example.com',
      },
    });

    const docs: import('../src/connectors/types.js').ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments([
      { id: 's1', name: 'Eng', type: 'space' },
    ])) {
      docs.push(doc);
    }

    expect(docs).toHaveLength(0);
  });

  it('reports progress during fetchDocuments', async () => {
    const mockFetch = vi
      .fn()
      // auth
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ accountId: 'u' }),
      })
      // fetchPages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ results: [], _links: {} }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({
      method: 'api-key',
      token: 'tok',
      params: {
        baseUrl: 'https://site.atlassian.net',
        email: 'e@e.com',
      },
    });

    const events: import('../src/connectors/types.js').ConnectorProgress[] = [];
    const gen = connector.fetchDocuments(
      [{ id: 's1', name: 'Space', type: 'space' }],
      (ev) => events.push(ev),
    );
    for await (const _doc of gen) {
      /* consume */
    }

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.phase).toBe('fetch');
  });
});

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

describe('Connector registry includes confluence', () => {
  it('getConnector returns a ConfluenceConnector', async () => {
    const { getConnector } = await import(
      '../src/connectors/index.js'
    );
    const connector = getConnector('confluence');
    expect(connector.name).toBe('confluence');
    expect(connector.displayName).toBe('Confluence');
  });

  it('listConnectors includes confluence as available', async () => {
    const { listConnectors } = await import(
      '../src/connectors/index.js'
    );
    const all = listConnectors();
    const conf = all.find((c) => c.name === 'confluence');
    expect(conf).toBeDefined();
    expect(conf!.status).toBe('available');
  });
});
