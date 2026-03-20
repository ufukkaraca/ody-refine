/** Google Drive API v3 client with rate limiting, retry, and shared drive support. */
import {
  ConnectorError, ConnectorAuthError,
  ConnectorRateLimitError, ConnectorServerError, ConnectorTokenExpiredError,
} from './types.js';
import { withConnectorRetry } from './retry.js';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MAX_PAGES = 20, PAGE_SIZE = 100, MAX_RETRIES = 3;
const RATE_LIMIT_DELAY_MS = 100;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/** Google Drive file metadata. */
export interface DriveFile {
  id: string; name: string; mimeType: string;
  parents?: string[]; modifiedTime?: string; size?: string;
  webViewLink?: string; driveId?: string; trashed?: boolean;
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
}

/** Google Drive change event. */
export interface DriveChange { fileId: string; removed: boolean; file?: DriveFile; time?: string; }

/** Google Drive shared drive. */
export interface DriveSharedDrive { id: string; name: string; }

/** Config for automatic OAuth token refresh. */
export interface DriveRefreshConfig { refreshToken: string; clientId: string; clientSecret: string; }

const SUPPORTED_MIME_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/pdf',
  'text/plain',
  'text/markdown',
]);

class DriveRateLimiter {
  private lastCallAt = 0;
  constructor(private readonly delayMs = RATE_LIMIT_DELAY_MS) {}
  async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < this.delayMs) {
      await new Promise<void>((r) => setTimeout(r, this.delayMs - elapsed));
    }
    this.lastCallAt = Date.now();
  }
}

/** Check if a MIME type is a supported document type. */
export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

/**
 * Low-level Google Drive API v3 client.
 * Bearer-token auth (Google OAuth2). Rate-limited at 10 req/s.
 */
export class GoogleDriveApiClient {
  private accessToken: string;
  private readonly rateLimiter = new DriveRateLimiter();

  constructor(
    accessToken: string,
    private readonly refreshConfig?: DriveRefreshConfig,
  ) {
    this.accessToken = accessToken;
  }

  /** Validate token by fetching user info. */
  async validateToken(): Promise<boolean> {
    try {
      await this.apiFetch<{ user: unknown }>(`${DRIVE_BASE}/about?fields=user`);
      return true;
    } catch { return false; }
  }

  /** List shared drives the user has access to. */
  async listSharedDrives(): Promise<DriveSharedDrive[]> {
    const drives: DriveSharedDrive[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${DRIVE_BASE}/drives`);
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await this.apiFetch<{
        drives?: DriveSharedDrive[]; nextPageToken?: string;
      }>(url.toString());
      for (const d of data.drives ?? []) drives.push(d);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return drives;
  }

  /** List files matching a query, filtering to supported types and size. */
  async listFiles(query: string, driveId?: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    const fields = 'files(id,name,mimeType,parents,modifiedTime,size,webViewLink,' +
      'lastModifyingUser,driveId,trashed),nextPageToken';
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${DRIVE_BASE}/files`);
      url.searchParams.set('q', query);
      url.searchParams.set('fields', fields);
      url.searchParams.set('pageSize', String(PAGE_SIZE));
      url.searchParams.set('supportsAllDrives', 'true');
      url.searchParams.set('includeItemsFromAllDrives', 'true');
      if (driveId) {
        url.searchParams.set('driveId', driveId);
        url.searchParams.set('corpora', 'drive');
      }
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await this.apiFetch<{
        files?: DriveFile[]; nextPageToken?: string;
      }>(url.toString());
      for (const f of data.files ?? []) {
        if (!f.trashed && isSupportedMimeType(f.mimeType)) {
          if (f.size && parseInt(f.size, 10) > MAX_FILE_SIZE) continue;
          files.push(f);
        }
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return files;
  }

  /** Export a Google Docs native file (Doc/Sheet) as text. */
  async exportFile(fileId: string, exportMimeType: string): Promise<string> {
    const url = `${DRIVE_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`;
    return this.apiFetchText(url);
  }

  /** Download a non-native file (PDF, plain text) as text. */
  async downloadFile(fileId: string): Promise<string> {
    return this.apiFetchText(`${DRIVE_BASE}/files/${fileId}?alt=media`);
  }

  /** Get the start page token for the Changes API. */
  async getStartPageToken(driveId?: string): Promise<string> {
    const url = new URL(`${DRIVE_BASE}/changes/startPageToken`);
    url.searchParams.set('supportsAllDrives', 'true');
    if (driveId) url.searchParams.set('driveId', driveId);
    const data = await this.apiFetch<{ startPageToken: string }>(url.toString());
    return data.startPageToken;
  }

  /** Fetch changes since a page token. Returns changes and new token. */
  async getChanges(
    pageToken: string,
    driveId?: string,
  ): Promise<{ changes: DriveChange[]; newStartPageToken?: string }> {
    const url = new URL(`${DRIVE_BASE}/changes`);
    url.searchParams.set('pageToken', pageToken);
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    url.searchParams.set('fields',
      'changes(fileId,removed,file(id,name,mimeType,parents,modifiedTime,size,' +
      'webViewLink,lastModifyingUser,trashed),time),newStartPageToken,nextPageToken');
    if (driveId) url.searchParams.set('driveId', driveId);
    return this.apiFetch(url.toString());
  }

  /** Build folder path (parent chain) for a file by traversing parents. */
  async buildFolderPath(
    fileId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const path: Array<{ id: string; name: string }> = [];
    let currentId = fileId;
    for (let depth = 0; depth < 10; depth++) {
      const url = `${DRIVE_BASE}/files/${currentId}?fields=id,name,parents&supportsAllDrives=true`;
      const file = await this.apiFetch<{
        id: string; name: string; parents?: string[];
      }>(url);
      path.unshift({ id: file.id, name: file.name });
      if (!file.parents?.length) break;
      currentId = file.parents[0]!;
    }
    return path;
  }

  /** Rate-limited HTTP request with typed retry via withConnectorRetry. */
  private async apiRequest(url: string): Promise<Response> {
    return withConnectorRetry(async () => {
      await this.rateLimiter.throttle();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (response.status === 401) {
        throw new ConnectorTokenExpiredError('google-drive', !!this.refreshConfig);
      }
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
        throw new ConnectorRateLimitError('google-drive', retryAfter);
      }
      if (response.status >= 500) {
        throw new ConnectorServerError('google-drive', response.status);
      }
      if (!response.ok) {
        throw new ConnectorError(
          'google-drive', 'apiFetch', `HTTP ${response.status} ${response.statusText}`,
        );
      }
      return response;
    }, {
      maxRetries: MAX_RETRIES,
      refreshToken: this.refreshConfig ? async (): Promise<void> => {
        const ok = await this.refreshAccessToken();
        if (!ok) throw new ConnectorAuthError('google-drive', 'Token refresh failed');
      } : undefined,
    });
  }

  private async apiFetch<T>(url: string): Promise<T> {
    const response = await this.apiRequest(url);
    return (await response.json()) as T;
  }

  private async apiFetchText(url: string): Promise<string> {
    const response = await this.apiRequest(url);
    return response.text();
  }

  /** Refresh the OAuth access token using the refresh token. */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshConfig) return false;
    const { refreshToken, clientId, clientSecret } = this.refreshConfig;
    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token', refresh_token: refreshToken,
          client_id: clientId, client_secret: clientSecret,
        }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { access_token?: string };
      if (!data.access_token) return false;
      this.accessToken = data.access_token;
      return true;
    } catch { return false; }
  }
}
