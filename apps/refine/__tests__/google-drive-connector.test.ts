// EXCEEDS_LIMIT: test fixture file — comprehensive connector test coverage
/**
 * Tests for the Google Drive connector: API client helpers, connector lifecycle,
 * and registry integration. Mocks fetch — no actual API access required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSupportedMimeType } from '../src/connectors/google-drive-api.js';
import { csvToMarkdownTable } from '../src/connectors/google-drive.js';
import type { GoogleDriveConnector as GoogleDriveConnectorType } from '../src/connectors/google-drive.js';
import type { ConnectorDocument, ConnectorProgress } from '../src/connectors/types.js';

// ---------------------------------------------------------------------------
// Helper: isSupportedMimeType
// ---------------------------------------------------------------------------

describe('isSupportedMimeType', () => {
  it('accepts Google Docs', () => {
    expect(isSupportedMimeType('application/vnd.google-apps.document')).toBe(true);
  });

  it('accepts Google Sheets', () => {
    expect(isSupportedMimeType('application/vnd.google-apps.spreadsheet')).toBe(true);
  });

  it('accepts PDFs', () => {
    expect(isSupportedMimeType('application/pdf')).toBe(true);
  });

  it('accepts plain text', () => {
    expect(isSupportedMimeType('text/plain')).toBe(true);
  });

  it('rejects images', () => {
    expect(isSupportedMimeType('image/png')).toBe(false);
  });

  it('rejects video', () => {
    expect(isSupportedMimeType('video/mp4')).toBe(false);
  });

  it('rejects folders', () => {
    expect(isSupportedMimeType('application/vnd.google-apps.folder')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper: csvToMarkdownTable
// ---------------------------------------------------------------------------

describe('csvToMarkdownTable', () => {
  it('converts CSV to markdown table', () => {
    const csv = 'Name,Age,City\nAlice,30,Berlin\nBob,25,SF';
    const table = csvToMarkdownTable(csv);
    expect(table).toContain('| Name | Age | City |');
    expect(table).toContain('| --- | --- | --- |');
    expect(table).toContain('| Alice | 30 | Berlin |');
    expect(table).toContain('| Bob | 25 | SF |');
  });

  it('handles quoted fields', () => {
    const csv = 'Name,Description\n"Smith, John","Has a comma"';
    const table = csvToMarkdownTable(csv);
    expect(table).toContain('Smith, John');
  });

  it('returns empty for empty CSV', () => {
    expect(csvToMarkdownTable('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockFetchOk(data: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  });
}

function mockFetchChain(...responses: Array<{ ok: boolean; status: number; data?: unknown }>): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok, status: r.status, statusText: r.ok ? 'OK' : 'Error',
      json: () => Promise.resolve(r.data ?? {}),
      text: () => Promise.resolve(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? {})),
      headers: new Map(),
    });
  }
  return fn;
}

// ---------------------------------------------------------------------------
// GoogleDriveConnector
// ---------------------------------------------------------------------------

describe('GoogleDriveConnector', () => {
  let connector: GoogleDriveConnectorType;

  async function createConnector(): Promise<GoogleDriveConnectorType> {
    const { GoogleDriveConnector } = await import('../src/connectors/google-drive.js');
    return new GoogleDriveConnector();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct connector metadata', async () => {
    connector = await createConnector();
    expect(connector.name).toBe('google-drive');
    expect(connector.displayName).toBe('Google Drive');
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
    ).rejects.toThrow('Access token required');
  });

  it('throws ConnectorAuthError when token is invalid', async () => {
    connector = await createConnector();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, statusText: 'Unauthorized',
    }));
    await expect(
      connector.authenticate({ method: 'oauth', token: 'bad-token' }),
    ).rejects.toThrow('Invalid token');
  });

  it('authenticates successfully with a valid token', async () => {
    connector = await createConnector();
    vi.stubGlobal('fetch', mockFetchOk({ user: { emailAddress: 'test@gmail.com' } }));
    await connector.authenticate({ method: 'oauth', token: 'valid-token' });
    expect(await connector.validate()).toBe(true);
  });

  it('listSources returns My Drive and shared drives', async () => {
    connector = await createConnector();
    const mockFetch = mockFetchChain(
      // auth: /about
      { ok: true, status: 200, data: { user: { emailAddress: 'test@gmail.com' } } },
      // listSharedDrives
      { ok: true, status: 200, data: { drives: [{ id: 'drive-1', name: 'Engineering' }] } },
    );
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'valid-token' });
    const sources = await connector.listSources();

    expect(sources.length).toBe(2);
    expect(sources[0]!.id).toBe('my-drive');
    expect(sources[0]!.name).toBe('My Drive');
    expect(sources[1]!.id).toBe('drive-1');
    expect(sources[1]!.name).toBe('Engineering');
  });

  it('fetchDocuments yields documents from Google Docs files', async () => {
    connector = await createConnector();
    const mockFetch = mockFetchChain(
      // auth
      { ok: true, status: 200, data: { user: {} } },
      // listFiles
      { ok: true, status: 200, data: {
        files: [{
          id: 'doc-1', name: 'Meeting Notes',
          mimeType: 'application/vnd.google-apps.document',
          modifiedTime: '2026-03-15T10:00:00Z',
          webViewLink: 'https://docs.google.com/document/d/doc-1',
          lastModifyingUser: { emailAddress: 'alice@example.com' },
        }],
      } },
      // exportFile (text/plain)
      { ok: true, status: 200, data: 'Meeting notes: discussed quarterly goals and roadmap for Q2. Action items assigned to each team member.' },
    );
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'valid-token' });
    const docs: ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments([{ id: 'my-drive', name: 'My Drive', type: 'drive' }])) {
      docs.push(doc);
    }

    expect(docs).toHaveLength(1);
    expect(docs[0]!.id).toBe('gdrive:file:doc-1');
    expect(docs[0]!.title).toBe('Meeting Notes');
    expect(docs[0]!.sourceType).toBe('google-drive');
    expect(docs[0]!.author).toBe('alice@example.com');
    expect(docs[0]!.content).toContain('quarterly goals');
  });

  it('fetchDocuments reports progress', async () => {
    connector = await createConnector();
    const mockFetch = mockFetchChain(
      { ok: true, status: 200, data: { user: {} } },
      { ok: true, status: 200, data: { files: [] } },
    );
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'tok' });
    const events: ConnectorProgress[] = [];
    const gen = connector.fetchDocuments(
      [{ id: 'my-drive', name: 'My Drive', type: 'drive' }],
      (ev) => events.push(ev),
    );
    for await (const _doc of gen) { /* consume */ }

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.phase).toBe('fetch');
    expect(events[0]!.message).toContain('My Drive');
  });

  it('fetchChanges yields SyncChange objects with upsert action', async () => {
    connector = await createConnector();
    const mockFetch = mockFetchChain(
      { ok: true, status: 200, data: { user: {} } },
      { ok: true, status: 200, data: {
        files: [{
          id: 'doc-new', name: 'Updated Doc',
          mimeType: 'text/plain',
          modifiedTime: '2026-03-18T10:00:00Z',
          webViewLink: 'https://drive.google.com/file/doc-new',
        }],
      } },
      { ok: true, status: 200, data: 'This is an updated document with enough content for the threshold check.' },
    );
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'oauth', token: 'tok' });
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('google-drive');

    const changes = [];
    for await (const change of connector.fetchChanges(cursor)) {
      changes.push(change);
    }
    expect(changes).toHaveLength(1);
    expect(changes[0]!.action).toBe('upsert');
    expect(changes[0]!.document.id).toContain('doc-new');
  });

  it('writeBack returns not-supported error', async () => {
    connector = await createConnector();
    const result = await connector.writeBack('gdrive:file:1', 'corrected', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not supported');
  });
});

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

describe('Connector registry includes google-drive', () => {
  it('getConnector returns a GoogleDriveConnector', async () => {
    const { getConnector } = await import('../src/connectors/index.js');
    const connector = getConnector('google-drive');
    expect(connector.name).toBe('google-drive');
    expect(connector.displayName).toBe('Google Drive');
  });

  it('listConnectors includes google-drive as available', async () => {
    const { listConnectors } = await import('../src/connectors/index.js');
    const all = listConnectors();
    const gdrive = all.find((c) => c.name === 'google-drive');
    expect(gdrive).toBeDefined();
    expect(gdrive!.status).toBe('available');
  });
});
