/**
 * Integration tests for the Confluence connector.
 * Mocks ConfluenceApiClient to test auth, space listing, page fetch, and errors.
 * @module __tests__/integration/connector-confluence
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfluenceConnector } from '../../src/connectors/confluence.js';
import { ConnectorAuthError } from '../../src/connectors/types.js';
import type { ConnectorDocument } from '../../src/connectors/types.js';

// --- Mock ConfluenceApiClient ---

const mockValidateCredentials = vi.fn();
const mockFetchSpaces = vi.fn();
const mockFetchPages = vi.fn();

vi.mock('../../src/connectors/confluence-api.js', () => ({
  ConfluenceApiClient: class {
    validateCredentials = mockValidateCredentials;
    fetchSpaces = mockFetchSpaces;
    fetchPages = mockFetchPages;
  },
  confluenceStorageToMarkdown: vi.fn().mockImplementation(
    (html: string) => html.length > 0
      ? `Converted markdown content from Confluence storage format: ${html.slice(0, 40)}`
      : '',
  ),
  ConfluenceRateLimiter: class { async throttle(): Promise<void> {} },
}));

vi.mock('../../src/connectors/resolve-credential.js', () => ({
  validateConnectorUrl: vi.fn(),
}));

// --- Helpers ---

async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>, max = 20,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) { docs.push(doc); if (docs.length >= max) break; }
  return docs;
}

interface MockPage {
  id: string; title: string; spaceId: string; status: string;
  version?: { number: number; createdAt: string };
  body?: { storage?: { value: string } };
  _links?: { webui?: string };
}

function makePage(id: string, title: string, spaceId: string): MockPage {
  return {
    id, title, spaceId, status: 'current',
    version: { number: 1, createdAt: '2026-03-20T10:00:00.000Z' },
    body: { storage: { value: `<p>Long enough HTML content for page ${title} in space ${spaceId}</p>` } },
    _links: { webui: `/wiki/spaces/ENG/pages/${id}` },
  };
}

// --- Tests ---

describe('Integration: Confluence connector (mocked)', () => {
  let connector: ConfluenceConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new ConfluenceConnector();
    mockValidateCredentials.mockResolvedValue(true);
  });

  it('authenticates with Basic auth (email + API token)', async () => {
    await connector.authenticate({
      method: 'api-key', token: 'conf-token',
      params: { baseUrl: 'https://mysite.atlassian.net', email: 'user@example.com' },
    });
    const valid = await connector.validate();
    expect(valid).toBe(true);
  });

  it('throws ConnectorAuthError when baseUrl is missing', async () => {
    await expect(
      connector.authenticate({
        method: 'api-key', token: 'conf-token',
        params: { email: 'user@example.com' },
      }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('throws ConnectorAuthError when credentials are invalid', async () => {
    mockValidateCredentials.mockResolvedValueOnce(false);
    await expect(
      connector.authenticate({
        method: 'api-key', token: 'bad-token',
        params: { baseUrl: 'https://mysite.atlassian.net', email: 'user@example.com' },
      }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('listSources returns spaces', async () => {
    mockFetchSpaces.mockResolvedValueOnce([
      { id: 'space-1', key: 'ENG', name: 'Engineering', type: 'global' },
      { id: 'space-2', key: 'HR', name: 'Human Resources', type: 'global' },
    ]);
    await connector.authenticate({
      method: 'api-key', token: 'conf-token',
      params: { baseUrl: 'https://mysite.atlassian.net', email: 'user@example.com' },
    });
    const sources = await connector.listSources();
    expect(sources.length).toBe(2);
    expect(sources[0]!.type).toBe('space');
    expect(sources[0]!.name).toBe('Engineering');
  });

  it('fetchDocuments yields pages from a space', async () => {
    mockFetchPages.mockResolvedValueOnce([
      makePage('p-1', 'API Guidelines', 'space-1'),
      makePage('p-2', 'Onboarding Guide', 'space-1'),
    ]);
    await connector.authenticate({
      method: 'api-key', token: 'conf-token',
      params: { baseUrl: 'https://mysite.atlassian.net', email: 'user@example.com' },
    });
    const sources = [{ id: 'space-1', name: 'Engineering', type: 'space' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(2);
    expect(docs[0]!.id).toBe('confluence:page:p-1');
    expect(docs[0]!.sourceType).toBe('confluence');
    expect(docs[0]!.title).toBe('API Guidelines');
  });

  it('fetchDocuments handles multiple spaces', async () => {
    mockFetchPages
      .mockResolvedValueOnce([makePage('p1', 'Page A', 's1')])
      .mockResolvedValueOnce([makePage('p2', 'Page B', 's2')]);
    await connector.authenticate({
      method: 'api-key', token: 'conf-token',
      params: { baseUrl: 'https://mysite.atlassian.net', email: 'user@example.com' },
    });
    const sources = [
      { id: 's1', name: 'Space 1', type: 'space' },
      { id: 's2', name: 'Space 2', type: 'space' },
    ];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(2);
    expect(mockFetchPages).toHaveBeenCalledTimes(2);
  });

  it('skips pages with content shorter than 20 chars', async () => {
    mockFetchPages.mockResolvedValueOnce([{
      id: 'short', title: 'Empty', spaceId: 's1', status: 'current',
      body: { storage: { value: '' } },
    }]);
    await connector.authenticate({
      method: 'api-key', token: 'conf-token',
      params: { baseUrl: 'https://mysite.atlassian.net', email: 'user@example.com' },
    });
    const docs = await collectDocs(
      connector.fetchDocuments([{ id: 's1', name: 'Space', type: 'space' }]),
    );
    expect(docs.length).toBe(0);
  });

  it('writeBack returns not implemented', async () => {
    await connector.authenticate({
      method: 'api-key', token: 'conf-token',
      params: { baseUrl: 'https://mysite.atlassian.net', email: 'user@example.com' },
    });
    const result = await connector.writeBack!('confluence:page:p-1', 'text', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet implemented');
  });

  it('getInitialCursor returns a timestamp cursor', () => {
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('confluence');
  });
});
