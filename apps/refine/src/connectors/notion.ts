/**
 * Notion connector for Ody Refine.
 * Reads Notion pages/databases via the Notion API and normalizes to ConnectorDocument.
 * Requires @notionhq/client as an optional dependency.
 * @module connectors/notion
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
import { ConnectorAuthError, ConnectorError } from './types.js';
import { blocksToMarkdown } from './notion-blocks.js';
import {
  loadNotionSdk,
  ensureSdkAvailable,
  validateNotionToken,
  RateLimiter,
  fetchAllBlocks,
  extractPageTitle,
} from './notion-api.js';
import type { NotionClient, NotionPage } from './notion-api.js';

/**
 * Notion connector — reads pages and databases, writes corrections back.
 *
 * Auth: api-key (Notion integration token from notion.so/my-integrations).
 * Sources: databases and top-level page trees.
 * Documents: pages with recursively extracted blocks converted to markdown.
 */
export class NotionConnector implements RefineConnector {
  readonly name = 'notion';
  readonly displayName = 'Notion';
  readonly authMethods: AuthMethod[] = ['api-key', 'oauth'];
  readonly supportsWriteBack = true;

  private client: NotionClient | null = null;
  private rateLimiter = new RateLimiter();

  /** @inheritdoc */
  async authenticate(auth: ConnectorAuth): Promise<void> {
    if (!auth.token) {
      throw new ConnectorAuthError('notion', 'Token is required');
    }

    // OAuth tokens are already validated during the exchange; skip
    // the /users/me validation call for them to avoid double-checking.
    if (auth.method !== 'oauth') {
      const valid = await validateNotionToken(auth.token);
      if (!valid) {
        throw new ConnectorAuthError(
          'notion',
          'Invalid token or insufficient permissions',
        );
      }
    }

    const sdk = await loadNotionSdk();
    ensureSdkAvailable(sdk);
    this.client = new sdk.Client({ auth: auth.token });
  }

  /** @inheritdoc */
  async listSources(): Promise<ConnectorSource[]> {
    const client = this.getClient();
    const sources: ConnectorSource[] = [];

    // Note: Notion API deprecated 'database' filter value (now 'data_source').
    // We skip database listing — pages are the primary source for doc scanning.

    // Search for pages (top-level only)
    await this.rateLimiter.throttle();
    const pageResults = await client.search({
      filter: { value: 'page', property: 'object' },
      page_size: 100,
    });
    for (const page of pageResults.results) {
      const p = page as unknown as NotionPage;
      const parent = p.parent as { type: string };
      if (parent.type === 'workspace') {
        const title = extractPageTitle(p);
        sources.push({ id: p.id, name: title, type: 'page' });
      }
    }

    return sources;
  }

  /** @inheritdoc */
  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.getClient();
    let current = 0;
    const total = sources.length;

    let failedCount = 0;
    for (const source of sources) {
      onProgress?.({ phase: 'fetch', current, total, message: source.name });

      try {
        if (source.type === 'database') {
          yield* this.fetchDatabasePages(client, source.id);
        } else {
          const doc = await this.fetchPageAsDocument(client, source.id);
          if (doc) yield doc;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Auth/token errors: stop immediately, report partial progress
        if (msg.includes('401') || msg.includes('403')
          || msg.includes('Unauthorized') || msg.includes('unauthorized')) {
          throw new ConnectorError('notion', 'fetch',
            `Token expired or revoked after fetching ${String(current)} of ${String(total)} sources. ` +
            `${String(current)} source(s) were fetched successfully before the error.`);
        }
        // Transient errors (rate limit, 5xx): skip this source, continue
        failedCount++;
      }
      current++;
    }
    onProgress?.({ phase: 'fetch', current: total, total });
    if (failedCount > 0 && current - failedCount === 0) {
      throw new ConnectorError('notion', 'fetch',
        `All ${String(total)} sources failed to fetch. Check your Notion token and permissions.`);
    }
  }

  /** @inheritdoc */
  getInitialCursor(): SyncCursor {
    return {
      type: 'timestamp',
      value: new Date().toISOString(),
      connectorName: 'notion',
      updatedAt: new Date().toISOString(),
    };
  }

  /** @inheritdoc */
  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    const client = this.getClient();
    const since = cursor ? new Date(cursor.value) : new Date(0);
    let pageCursor: string | undefined;

    do {
      await this.rateLimiter.throttle();
      const response = await client.search({
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        ...(pageCursor ? { start_cursor: pageCursor } : {}),
        page_size: 100,
      });

      for (const result of response.results) {
        if (result.object !== 'page') continue;
        const page = result as unknown as NotionPage;
        const editedAt = new Date(page.last_edited_time);
        if (editedAt <= since) return;
        const doc = await this.pageToDocument(client, page);
        if (doc) yield { document: doc, action: 'upsert' };
      }

      pageCursor = response.has_more
        ? (response.next_cursor ?? undefined)
        : undefined;
    } while (pageCursor);
  }

  /** @inheritdoc */
  async writeBack(
    documentId: string,
    _correctedContent: string,
    reason: string,
  ): Promise<WriteBackResult> {
    const client = this.getClient();
    const pageId = documentId.replace('notion:page:', '');
    const url = `https://notion.so/${pageId.replace(/-/g, '')}`;

    try {
      await this.rateLimiter.throttle();
      await client.comments.create({
        parent: { page_id: pageId },
        rich_text: [{ type: 'text', text: { content: `Ody Refine: ${reason}` } }],
      });
      return { documentId, success: true, updatedUrl: url };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { documentId, success: false, updatedUrl: url, error: msg };
    }
  }

  /** @inheritdoc */
  async validate(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.rateLimiter.throttle();
      await this.client.users.me();
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch all pages from a Notion database. */
  private async *fetchDatabasePages(
    client: NotionClient,
    databaseId: string,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    let cursor: string | undefined;

    do {
      await this.rateLimiter.throttle();
      const response = await client.databases.query({
        database_id: databaseId,
        ...(cursor ? { start_cursor: cursor } : {}),
      });

      for (const page of response.results) {
        try {
          const doc = await this.pageToDocument(client, page);
          if (doc) yield doc;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('401') || msg.includes('403')
            || msg.includes('Unauthorized') || msg.includes('unauthorized')) {
            throw err; // Auth failure — propagate immediately
          }
          // Skip individual page failures (e.g. permission denied on one page)
        }
      }

      cursor = response.has_more
        ? (response.next_cursor ?? undefined)
        : undefined;
    } while (cursor);
  }

  /** Fetch a single page by ID and convert to ConnectorDocument. */
  private async fetchPageAsDocument(
    client: NotionClient,
    pageId: string,
  ): Promise<ConnectorDocument | null> {
    await this.rateLimiter.throttle();
    const page = await client.pages.retrieve({ page_id: pageId }) as NotionPage;
    return this.pageToDocument(client, page);
  }

  /** Convert a Notion page to a ConnectorDocument. */
  private async pageToDocument(
    client: NotionClient,
    page: NotionPage,
  ): Promise<ConnectorDocument | null> {
    const title = extractPageTitle(page);
    const blocks = await fetchAllBlocks(
      client, page.id, this.rateLimiter,
    );
    const content = blocksToMarkdown(blocks);
    if (content.length < 20) return null; // skip near-empty pages

    const parent = page.parent as unknown as Record<string, string>;
    const parentChain = [
      { type: 'workspace', name: 'Notion Workspace' },
      ...(page.parent.type === 'database_id'
        ? [{ type: 'database', name: 'Database', id: parent['database_id'] }]
        : page.parent.type === 'page_id'
          ? [{ type: 'page', name: 'Parent Page', id: parent['page_id'] }]
          : []),
    ];

    return {
      id: `notion:page:${page.id}`,
      title,
      content,
      sourceType: 'notion',
      sourceUrl: page.url,
      lastModified: new Date(page.last_edited_time),
      metadata: {
        notionId: page.id,
        parentType: page.parent.type,
        parentChain,
        analysisHints: { factDensity: 'normal' as const, authoritative: true },
      },
    };
  }

  /** Get the authenticated client or throw. */
  private getClient(): NotionClient {
    if (!this.client) {
      throw new ConnectorAuthError(
        'notion',
        'Not authenticated. Call authenticate() first.',
      );
    }
    return this.client;
  }
}
