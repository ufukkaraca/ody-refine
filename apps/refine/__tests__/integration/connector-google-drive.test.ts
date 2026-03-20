/**
 * Integration tests for the Google Drive connector.
 * Mocks GoogleDriveApiClient to test auth, file listing, export, and errors.
 * @module __tests__/integration/connector-google-drive
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDriveConnector, csvToMarkdownTable } from '../../src/connectors/google-drive.js';
import { ConnectorAuthError } from '../../src/connectors/types.js';
import type { ConnectorDocument } from '../../src/connectors/types.js';

// --- Mock GoogleDriveApiClient ---

const mockValidateToken = vi.fn();
const mockListSharedDrives = vi.fn();
const mockListFiles = vi.fn();
const mockExportFile = vi.fn();
const mockDownloadFile = vi.fn();
const mockBuildFolderPath = vi.fn();

vi.mock('../../src/connectors/google-drive-api.js', () => ({
  GoogleDriveApiClient: class {
    validateToken = mockValidateToken;
    listSharedDrives = mockListSharedDrives;
    listFiles = mockListFiles;
    exportFile = mockExportFile;
    downloadFile = mockDownloadFile;
    buildFolderPath = mockBuildFolderPath;
  },
}));

// --- Helpers ---

async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>, max = 20,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) { docs.push(doc); if (docs.length >= max) break; }
  return docs;
}

interface MockFile {
  id: string; name: string; mimeType: string;
  parents?: string[]; modifiedTime?: string;
  webViewLink?: string; driveId?: string;
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
}

function makeFile(id: string, name: string, mimeType: string): MockFile {
  return {
    id, name, mimeType,
    parents: ['folder-1'],
    modifiedTime: '2026-03-20T10:00:00.000Z',
    webViewLink: `https://docs.google.com/document/d/${id}`,
    lastModifyingUser: { displayName: 'Alice', emailAddress: 'alice@example.com' },
  };
}

// --- Tests ---

describe('Integration: Google Drive connector (mocked)', () => {
  let connector: GoogleDriveConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new GoogleDriveConnector();
    mockValidateToken.mockResolvedValue(true);
    mockBuildFolderPath.mockResolvedValue([
      { id: 'root', name: 'My Drive' },
      { id: 'folder-1', name: 'Documents' },
    ]);
  });

  it('authenticates successfully with a valid OAuth token', async () => {
    await connector.authenticate({ method: 'oauth', token: 'ya29.drive_test' });
    const valid = await connector.validate();
    expect(valid).toBe(true);
  });

  it('throws ConnectorAuthError when token is missing', async () => {
    await expect(
      connector.authenticate({ method: 'oauth', token: '' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('throws ConnectorAuthError when token validation fails', async () => {
    mockValidateToken.mockResolvedValueOnce(false);
    await expect(
      connector.authenticate({ method: 'oauth', token: 'ya29.bad' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('listSources returns My Drive + shared drives', async () => {
    mockListSharedDrives.mockResolvedValueOnce([
      { id: 'sd-1', name: 'Team Drive' },
      { id: 'sd-2', name: 'Marketing' },
    ]);
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const sources = await connector.listSources();
    expect(sources.length).toBe(3); // My Drive + 2 shared
    expect(sources[0]!.id).toBe('my-drive');
    expect(sources[0]!.type).toBe('drive');
    expect(sources[1]!.type).toBe('shared-drive');
  });

  it('fetchDocuments exports Google Docs as text', async () => {
    const file = makeFile('doc-1', 'Meeting Notes.gdoc',
      'application/vnd.google-apps.document');
    mockListFiles.mockResolvedValueOnce([file]);
    mockExportFile.mockResolvedValueOnce(
      'Meeting notes from the quarterly all-hands on product roadmap and priorities.',
    );
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const sources = [{ id: 'my-drive', name: 'My Drive', type: 'drive' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(1);
    expect(docs[0]!.id).toBe('gdrive:file:doc-1');
    expect(docs[0]!.sourceType).toBe('google-drive');
    expect(docs[0]!.content).toContain('Meeting notes');
  });

  it('fetchDocuments exports Google Sheets as CSV/markdown', async () => {
    const file = makeFile('sheet-1', 'Budget.gsheet',
      'application/vnd.google-apps.spreadsheet');
    mockListFiles.mockResolvedValueOnce([file]);
    mockExportFile.mockResolvedValueOnce('Name,Amount\nAlice,1000\nBob,2000');
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const docs = await collectDocs(
      connector.fetchDocuments([{ id: 'my-drive', name: 'My Drive', type: 'drive' }]),
    );
    expect(docs.length).toBe(1);
    expect(docs[0]!.content).toContain('|');
  });

  it('fetchDocuments handles PDFs as placeholders', async () => {
    const file = makeFile('pdf-1', 'Contract.pdf', 'application/pdf');
    mockListFiles.mockResolvedValueOnce([file]);
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const docs = await collectDocs(
      connector.fetchDocuments([{ id: 'my-drive', name: 'My Drive', type: 'drive' }]),
    );
    expect(docs.length).toBe(1);
    expect(docs[0]!.content).toContain('PDF Document');
  });

  it('fetchDocuments downloads plain text files', async () => {
    const file = makeFile('txt-1', 'notes.txt', 'text/plain');
    mockListFiles.mockResolvedValueOnce([file]);
    mockDownloadFile.mockResolvedValueOnce(
      'Plain text notes about the project milestones and next steps for the team.',
    );
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const docs = await collectDocs(
      connector.fetchDocuments([{ id: 'my-drive', name: 'My Drive', type: 'drive' }]),
    );
    expect(docs.length).toBe(1);
    expect(docs[0]!.content).toContain('Plain text notes');
  });

  it('csvToMarkdownTable converts CSV to markdown table', () => {
    const csv = 'Header1,Header2\nVal1,Val2\nVal3,Val4';
    const table = csvToMarkdownTable(csv);
    expect(table).toContain('| Header1 | Header2 |');
    expect(table).toContain('| --- | --- |');
    expect(table).toContain('| Val1 | Val2 |');
  });

  it('csvToMarkdownTable returns empty for empty CSV', () => {
    expect(csvToMarkdownTable('')).toBe('');
  });

  it('writeBack returns not supported', async () => {
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const result = await connector.writeBack!('gdrive:file:doc-1', 'text', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not supported');
  });

  it('getInitialCursor returns a timestamp cursor', () => {
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('google-drive');
  });
});
