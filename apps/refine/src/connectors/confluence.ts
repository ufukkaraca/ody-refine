/**
 * Confluence connector for Ody Refine.
 * Reads Confluence Cloud spaces/pages via REST API v2, normalizes to ConnectorDocument.
 * Supports Basic auth (email + API token) and OAuth (bearer token).
 * @module connectors/confluence
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
import { validateConnectorUrl } from './resolve-credential.js';
import {
  ConfluenceApiClient,
  confluenceStorageToMarkdown,
} from './confluence-api.js';
import type { ConfluenceAuthMode, ConfluencePage } from './confluence-api.js';

/**
 * Confluence connector — reads spaces and pages, converts to markdown.
 * Auth: api-key (Basic with email+token) or oauth (Bearer with cloudId).
 * Env fallbacks: CONFLUENCE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN.
 */
export class ConfluenceConnector implements RefineConnector {
  readonly name = 'confluence';
  readonly displayName = 'Confluence';
  readonly authMethods: AuthMethod[] = ['api-key', 'oauth'];
  readonly supportsWriteBack = false;

  private client: ConfluenceApiClient | null = null;
  private baseUrl = '';

  /** @inheritdoc */
  async authenticate(auth: ConnectorAuth): Promise<void> {
    const { baseUrl, authMode } = this.resolveAuth(auth);
    this.baseUrl = baseUrl;
    const client = new ConfluenceApiClient(baseUrl, authMode);

    const valid = await client.validateCredentials();
    if (!valid) {
      throw new ConnectorAuthError(
        'confluence',
        'Invalid credentials or insufficient permissions',
      );
    }
    this.client = client;
  }

  /** @inheritdoc */
  async listSources(): Promise<ConnectorSource[]> {
    const client = this.ensureClient();
    const spaces = await client.fetchSpaces();

    return spaces.map((s) => ({
      id: s.id,
      name: s.name,
      type: 'space',
    }));
  }

  /** @inheritdoc */
  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.ensureClient();
    let processed = 0;
    const total = sources.length;

    for (const source of sources) {
      onProgress?.({
        phase: 'fetch',
        current: processed,
        total,
        message: `Fetching space: ${source.name}`,
      });

      const pages = await client.fetchPages([source.id]);
      for (const page of pages) {
        const doc = this.pageToDocument(page);
        if (doc) yield doc;
      }

      processed++;
    }
    onProgress?.({ phase: 'fetch', current: total, total });
  }

  /** @inheritdoc */
  getInitialCursor(): SyncCursor {
    return {
      type: 'timestamp',
      value: new Date().toISOString(),
      connectorName: 'confluence',
      updatedAt: new Date().toISOString(),
    };
  }

  /** @inheritdoc */
  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    const client = this.ensureClient();
    const since = cursor ? new Date(cursor.value) : undefined;
    const pages = await client.fetchPages(
      undefined,
      since?.toISOString(),
    );

    for (const page of pages) {
      if (since) {
        const createdAt = page.version?.createdAt;
        if (createdAt && new Date(createdAt) <= since) continue;
      }
      const doc = this.pageToDocument(page);
      if (doc) yield { document: doc, action: 'upsert' };
    }
  }

  /** @inheritdoc */
  async writeBack(
    documentId: string,
    _correctedContent: string,
    _reason: string,
  ): Promise<WriteBackResult> {
    const pageId = documentId.replace('confluence:page:', '');
    const url = this.baseUrl
      ? `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${pageId}`
      : `https://confluence.atlassian.com/pages/viewpage.action?pageId=${pageId}`;
    return {
      documentId,
      success: false,
      updatedUrl: url,
      error: 'Write-back is not yet implemented. Edit the page directly.',
    };
  }

  /** @inheritdoc */
  async validate(): Promise<boolean> {
    if (!this.client) return false;
    return this.client.validateCredentials();
  }

  /** Resolve auth params from ConnectorAuth + env fallbacks. */
  private resolveAuth(auth: ConnectorAuth): {
    baseUrl: string;
    authMode: ConfluenceAuthMode;
  } {
    if (auth.method === 'oauth') {
      if (!auth.token) {
        throw new ConnectorAuthError('confluence', 'OAuth access token is required');
      }
      const cloudId = auth.params?.['cloudId'];
      if (!cloudId) {
        throw new ConnectorAuthError(
          'confluence',
          'cloudId is required for OAuth. Pass it in auth.params.cloudId.',
        );
      }
      return {
        baseUrl: `https://api.atlassian.com/ex/confluence/${cloudId}`,
        authMode: { type: 'oauth', accessToken: auth.token },
      };
    }

    // api-key mode: Basic auth with email + token
    const baseUrl =
      auth.params?.['baseUrl'] ??
      process.env['CONFLUENCE_URL'] ??
      '';
    if (baseUrl) validateConnectorUrl(baseUrl);
    const email =
      auth.params?.['email'] ??
      process.env['CONFLUENCE_EMAIL'] ??
      '';
    const apiToken = auth.token || process.env['CONFLUENCE_API_TOKEN'] || '';

    if (!baseUrl) {
      throw new ConnectorAuthError(
        'confluence',
        'Base URL is required. Set CONFLUENCE_URL or pass auth.params.baseUrl.',
      );
    }
    if (!email) {
      throw new ConnectorAuthError(
        'confluence',
        'Email is required. Set CONFLUENCE_EMAIL or pass auth.params.email.',
      );
    }
    if (!apiToken) {
      throw new ConnectorAuthError(
        'confluence',
        'API token is required. Set CONFLUENCE_API_TOKEN or pass auth.token.',
      );
    }

    return {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      authMode: { type: 'basic', email, apiToken },
    };
  }

  /** Convert a Confluence page to a ConnectorDocument, or null if too short. */
  private pageToDocument(page: ConfluencePage): ConnectorDocument | null {
    const rawHtml = page.body?.storage?.value ?? '';
    const content = confluenceStorageToMarkdown(rawHtml);
    if (content.length < 20) return null;

    const webUrl = page._links?.webui
      ? `${this.baseUrl}${page._links.webui}`
      : `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${page.id}`;

    return {
      id: `confluence:page:${page.id}`,
      title: page.title,
      content,
      sourceType: 'confluence',
      sourceUrl: webUrl,
      lastModified: page.version?.createdAt
        ? new Date(page.version.createdAt)
        : undefined,
      metadata: {
        confluencePageId: page.id,
        spaceId: page.spaceId,
        version: page.version?.number,
        parentChain: [
          { type: 'space', name: `Space ${page.spaceId}`, id: page.spaceId },
          { type: 'page', name: page.title, id: page.id },
        ],
        analysisHints: { factDensity: 'normal' as const, authoritative: true },
      },
    };
  }

  /** Guard: throw if not authenticated, return client. */
  private ensureClient(): ConfluenceApiClient {
    if (!this.client) {
      throw new ConnectorAuthError(
        'confluence',
        'Not authenticated. Call authenticate() first.',
      );
    }
    return this.client;
  }
}
