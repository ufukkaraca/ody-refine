/**
 * Google Drive connector for Ody Refine.
 * Reads Google Docs, Sheets, PDFs, and plain text via Drive API v3.
 * Auth: OAuth2 with refresh token (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).
 * @module connectors/google-drive
 */
import type {
  RefineConnector,
  ConnectorAuth,
  ConnectorSource,
  ConnectorDocument,
  ConnectorProgress,
  WriteBackResult,
  AuthMethod,
  SyncCursor,
  SyncChange,
} from './types.js';
import { ConnectorAuthError } from './types.js';
import { GoogleDriveApiClient } from './google-drive-api.js';
import type { DriveFile, DriveRefreshConfig } from './google-drive-api.js';

/** MIME type query filter for supported document types. */
const MIME_QUERY = [
  "mimeType='application/vnd.google-apps.document'",
  "mimeType='application/vnd.google-apps.spreadsheet'",
  "mimeType='application/pdf'",
  "mimeType='text/plain'",
  "mimeType='text/markdown'",
].join(' or ');

/**
 * Google Drive connector — reads documents and converts to markdown.
 *
 * Auth: oauth (Bearer token from Google OAuth2).
 * Sources: My Drive + shared drives.
 * Documents: Google Docs, Sheets (as markdown table), PDFs, plain text.
 * Write-back: not supported.
 */
export class GoogleDriveConnector implements RefineConnector {
  readonly name = 'google-drive';
  readonly displayName = 'Google Drive';
  readonly authMethods: AuthMethod[] = ['oauth'];
  readonly supportsWriteBack = false;

  private client: GoogleDriveApiClient | null = null;

  /** @inheritdoc */
  async authenticate(auth: ConnectorAuth): Promise<void> {
    const token = auth.token || process.env['GOOGLE_DRIVE_ACCESS_TOKEN'];
    if (!token) {
      throw new ConnectorAuthError(
        'google-drive',
        'Access token required. Set GOOGLE_DRIVE_ACCESS_TOKEN or pass auth.token.',
      );
    }
    const client = new GoogleDriveApiClient(token, buildRefreshConfig(auth));
    if (!await client.validateToken()) {
      throw new ConnectorAuthError(
        'google-drive', 'Invalid token or insufficient permissions',
      );
    }
    this.client = client;
  }

  /** @inheritdoc */
  async listSources(): Promise<ConnectorSource[]> {
    const client = this.ensureClient();
    const sources: ConnectorSource[] = [
      { id: 'my-drive', name: 'My Drive', type: 'drive' },
    ];
    const sharedDrives = await client.listSharedDrives();
    for (const drive of sharedDrives) {
      sources.push({ id: drive.id, name: drive.name, type: 'shared-drive' });
    }
    return sources;
  }

  /** @inheritdoc */
  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.ensureClient();
    let processed = 0;
    for (const source of sources) {
      onProgress?.({
        phase: 'fetch', current: processed, total: sources.length,
        message: `Scanning: ${source.name}...`,
      });
      const driveId = source.id === 'my-drive' ? undefined : source.id;
      const query = `trashed=false and (${MIME_QUERY})`;
      const files = await client.listFiles(query, driveId);
      for (const file of files) {
        const doc = await fileToDocument(client, file);
        if (doc) yield doc;
      }
      processed++;
      onProgress?.({
        phase: 'fetch', current: processed, total: sources.length,
        message: `Done ${source.name} (${files.length} files)`,
      });
    }
  }

  /** @inheritdoc */
  getInitialCursor(): SyncCursor {
    return {
      type: 'timestamp',
      value: new Date().toISOString(),
      connectorName: 'google-drive',
      updatedAt: new Date().toISOString(),
    };
  }

  /** @inheritdoc */
  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    const client = this.ensureClient();
    const since = cursor ? new Date(cursor.value) : undefined;
    const query = since
      ? `modifiedTime>'${since.toISOString()}' and trashed=false and (${MIME_QUERY})`
      : `trashed=false and (${MIME_QUERY})`;
    const files = await client.listFiles(query);
    for (const file of files) {
      const doc = await fileToDocument(client, file);
      if (doc) yield { document: doc, action: 'upsert' };
    }
  }

  /** @inheritdoc */
  async writeBack(
    documentId: string, _correctedContent: string, _reason: string,
  ): Promise<WriteBackResult> {
    return {
      documentId, success: false,
      error: 'Write-back is not supported for Google Drive.',
    };
  }

  /** @inheritdoc */
  async validate(): Promise<boolean> {
    if (!this.client) return false;
    return this.client.validateToken();
  }

  /** Guard: throw if not authenticated. */
  private ensureClient(): GoogleDriveApiClient {
    if (!this.client) {
      throw new ConnectorAuthError(
        'google-drive', 'Not authenticated. Call authenticate() first.',
      );
    }
    return this.client;
  }
}

// --- Helpers ---

/** Build DriveRefreshConfig from ConnectorAuth if refresh token available. */
function buildRefreshConfig(auth: ConnectorAuth): DriveRefreshConfig | undefined {
  if (!auth.refreshToken) return undefined;
  const clientId = auth.params?.['clientId']
    ?? process.env['ODY_GOOGLE_CLIENT_ID'] ?? process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = auth.params?.['clientSecret']
    ?? process.env['ODY_GOOGLE_CLIENT_SECRET'] ?? process.env['GOOGLE_CLIENT_SECRET'];
  if (!clientId || !clientSecret) return undefined;
  return { refreshToken: auth.refreshToken, clientId, clientSecret };
}

/** Convert a Drive file to a ConnectorDocument, or null if empty/error. */
async function fileToDocument(
  client: GoogleDriveApiClient,
  file: DriveFile,
): Promise<ConnectorDocument | null> {
  let content: string;
  try {
    if (file.mimeType === 'application/vnd.google-apps.document') {
      content = await client.exportFile(file.id, 'text/plain');
    } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const csv = await client.exportFile(file.id, 'text/csv');
      content = csvToMarkdownTable(csv);
    } else if (file.mimeType === 'application/pdf') {
      content = `[PDF Document: ${file.name}]`;
    } else {
      content = await client.downloadFile(file.id);
    }
  } catch { return null; }
  if (content.length < 20) return null;

  let parentChain: Array<{ type: string; name: string; id?: string }> | undefined;
  if (file.parents?.length) {
    try {
      const folders = await client.buildFolderPath(file.parents[0]!);
      parentChain = folders.map((f) => ({ type: 'folder', name: f.name, id: f.id }));
    } catch { /* skip parent chain on error */ }
  }

  return {
    id: `gdrive:file:${file.id}`,
    title: file.name,
    content,
    sourceType: 'google-drive',
    sourceUrl: file.webViewLink,
    lastModified: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
    author: file.lastModifyingUser?.emailAddress ?? file.lastModifyingUser?.displayName,
    metadata: {
      fileId: file.id, mimeType: file.mimeType, driveId: file.driveId,
      ...(parentChain ? { parentChain } : {}),
      analysisHints: { factDensity: 'normal' as const, authoritative: true },
    },
  };
}

/** Convert CSV text to a markdown table. */
export function csvToMarkdownTable(csv: string): string {
  const trimmed = csv.trim();
  if (trimmed.length === 0) return '';
  const lines = trimmed.split('\n');
  const header = parseCsvLine(lines[0]!);
  const rows = lines.slice(1).map(parseCsvLine);
  const table = [
    '| ' + header.join(' | ') + ' |',
    '| ' + header.map(() => '---').join(' | ') + ' |',
    ...rows.map((row) => '| ' + row.join(' | ') + ' |'),
  ];
  return table.join('\n');
}

/** Simple CSV line parser (handles quoted fields). */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}
