/**
 * Integration tests for the Notion connector.
 * Mocks the Notion SDK to test auth, fetch, pagination, and error handling.
 * @module __tests__/integration/connector-notion
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotionConnector } from '../../src/connectors/notion.js';
import { ConnectorAuthError } from '../../src/connectors/types.js';
import type { ConnectorDocument } from '../../src/connectors/types.js';

// --- Mock the Notion API helpers ---

const mockSearch = vi.fn();
const mockPagesRetrieve = vi.fn();
const mockBlocksChildrenList = vi.fn();
const mockDbQuery = vi.fn();
const mockUsersMe = vi.fn();
const mockCommentsCreate = vi.fn();

vi.mock('../../src/connectors/notion-api.js', () => ({
  loadNotionSdk: vi.fn().mockResolvedValue({
    Client: class MockNotionClient {
      search = mockSearch;
      pages = { retrieve: mockPagesRetrieve };
      blocks = { children: { list: mockBlocksChildrenList } };
      databases = { query: mockDbQuery };
      comments = { create: mockCommentsCreate };
      users = { me: mockUsersMe };
    },
  }),
  ensureSdkAvailable: vi.fn(),
  validateNotionToken: vi.fn().mockResolvedValue(true),
  RateLimiter: class { async throttle(): Promise<void> {} },
  fetchAllBlocks: vi.fn().mockResolvedValue([
    { id: 'b1', type: 'paragraph', has_children: false,
      paragraph: { rich_text: [{ plain_text: 'This is enough content to pass the 20-char minimum filter.' }] } },
  ]),
  extractPageTitle: vi.fn().mockReturnValue('Test Page Title'),
}));

vi.mock('../../src/connectors/notion-blocks.js', () => ({
  blocksToMarkdown: vi.fn().mockReturnValue(
    'This is enough content to pass the 20-char minimum filter for Notion pages.',
  ),
}));

// --- Helpers ---

function makePage(id: string, parentType = 'workspace'): Record<string, unknown> {
  return {
    id, object: 'page', url: `https://notion.so/${id}`,
    last_edited_time: '2026-03-20T10:00:00Z',
    properties: { Name: { type: 'title', title: [{ plain_text: `Page ${id}` }] } },
    parent: { type: parentType },
  };
}

async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>, max = 10,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) { docs.push(doc); if (docs.length >= max) break; }
  return docs;
}

// --- Tests ---

describe('Integration: Notion connector (mocked)', () => {
  let connector: NotionConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new NotionConnector();
    mockUsersMe.mockResolvedValue({ id: 'user-1', name: 'Test User' });
  });

  it('authenticates successfully with a valid token', async () => {
    await connector.authenticate({ method: 'api-key', token: 'ntn_test_token' });
    const valid = await connector.validate();
    expect(valid).toBe(true);
  });

  it('throws ConnectorAuthError when token is missing', async () => {
    await expect(
      connector.authenticate({ method: 'api-key', token: '' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('listSources returns workspace-level pages', async () => {
    mockSearch.mockResolvedValueOnce({
      results: [makePage('page-1'), makePage('page-2')],
      has_more: false, next_cursor: null,
    });
    await connector.authenticate({ method: 'api-key', token: 'ntn_valid' });
    const sources = await connector.listSources();
    expect(sources.length).toBe(2);
    expect(sources[0]!.type).toBe('page');
  });

  it('fetchDocuments yields properly structured documents', async () => {
    mockPagesRetrieve.mockResolvedValue(makePage('page-1'));
    await connector.authenticate({ method: 'api-key', token: 'ntn_valid' });
    const sources = [{ id: 'page-1', name: 'Test Page', type: 'page' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(1);
    expect(docs[0]!.id).toBe('notion:page:page-1');
    expect(docs[0]!.sourceType).toBe('notion');
    expect(docs[0]!.content.length).toBeGreaterThan(20);
  });

  it('fetchDocuments handles database source with pagination', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        results: [makePage('db-page-1', 'database_id')],
        has_more: true, next_cursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        results: [makePage('db-page-2', 'database_id')],
        has_more: false, next_cursor: null,
      });
    await connector.authenticate({ method: 'api-key', token: 'ntn_valid' });
    const sources = [{ id: 'db-1', name: 'My Database', type: 'database' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(2);
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  it('skips sources that fail with transient errors', async () => {
    mockPagesRetrieve
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValueOnce(makePage('page-ok'));
    await connector.authenticate({ method: 'api-key', token: 'ntn_valid' });
    const sources = [
      { id: 'page-fail', name: 'Fail', type: 'page' },
      { id: 'page-ok', name: 'OK', type: 'page' },
    ];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(1);
    expect(docs[0]!.id).toContain('page-ok');
  });

  it('throws on auth errors (401) during fetch', async () => {
    mockPagesRetrieve.mockRejectedValueOnce(new Error('401 Unauthorized'));
    await connector.authenticate({ method: 'api-key', token: 'ntn_valid' });
    const sources = [{ id: 'page-1', name: 'Page', type: 'page' }];
    await expect(collectDocs(connector.fetchDocuments(sources))).rejects.toThrow();
  });

  it('writeBack creates a comment on the page', async () => {
    mockCommentsCreate.mockResolvedValue({ id: 'comment-1' });
    await connector.authenticate({ method: 'api-key', token: 'ntn_valid' });
    const result = await connector.writeBack!(
      'notion:page:abc-123', 'Corrected text', 'Factual error',
    );
    expect(result.success).toBe(true);
    expect(result.updatedUrl).toContain('notion.so');
  });

  it('getInitialCursor returns a timestamp cursor', () => {
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('notion');
  });
});
