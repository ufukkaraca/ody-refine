/**
 * Confluence Cloud REST API v2 client for Ody Refine.
 * Fetch-based (no SDK). Handles rate limiting, pagination, retries.
 * Supports both API-token (Basic auth) and OAuth (Bearer) flows.
 * @module connectors/confluence-api
 */
import { ConnectorError } from './types.js';

export { confluenceStorageToMarkdown } from './confluence-storage.js';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
/** Conservative rate limit: ~5 req/sec for Confluence Cloud. */
const RATE_LIMIT_DELAY_MS = 200;
/** Maximum pages fetched per sync to prevent runaway requests. */
const MAX_PAGES_PER_SYNC = 2_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Confluence space from the v2 API. */
export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
}

/** Confluence page from the v2 API. */
export interface ConfluencePage {
  id: string;
  title: string;
  spaceId: string;
  status: string;
  version?: { number: number; createdAt: string };
  body?: { storage?: { value: string } };
  _links?: { webui?: string };
}

/** Paginated response envelope from Confluence v2 endpoints. */
interface PaginatedResponse<T> {
  results: T[];
  _links?: { next?: string };
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

/** Simple rate limiter: ensures minimum delay between API calls. */
export class ConfluenceRateLimiter {
  private lastCallAt = 0;
  private readonly delayMs: number;

  constructor(delayMs = RATE_LIMIT_DELAY_MS) {
    this.delayMs = delayMs;
  }

  /** Wait if needed to respect rate limit, then mark call time. */
  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallAt;
    if (elapsed < this.delayMs) {
      await new Promise<void>((r) => setTimeout(r, this.delayMs - elapsed));
    }
    this.lastCallAt = Date.now();
  }
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

/** Auth mode for the Confluence API client. */
export type ConfluenceAuthMode =
  | { type: 'basic'; email: string; apiToken: string }
  | { type: 'oauth'; accessToken: string };

/**
 * Low-level Confluence Cloud API client.
 * Base URL: https://{site}.atlassian.net  (basic auth)
 *           or https://api.atlassian.com/ex/confluence/{cloudId} (OAuth)
 */
export class ConfluenceApiClient {
  private readonly rateLimiter: ConfluenceRateLimiter;

  constructor(
    private readonly baseUrl: string,
    private readonly auth: ConfluenceAuthMode,
    rateLimiter?: ConfluenceRateLimiter,
  ) {
    this.rateLimiter = rateLimiter ?? new ConfluenceRateLimiter();
  }

  /** Validate credentials by fetching the current user. */
  async validateCredentials(): Promise<boolean> {
    try {
      await this.apiFetch<{ accountId: string }>(
        '/wiki/rest/api/user/current',
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch all spaces (up to 250). */
  async fetchSpaces(): Promise<ConfluenceSpace[]> {
    const data = await this.apiFetch<PaginatedResponse<ConfluenceSpace>>(
      '/wiki/api/v2/spaces?limit=250',
    );
    return data.results;
  }

  /** Fetch pages, optionally filtered by space IDs and modified-since date. */
  async fetchPages(
    spaceIds?: string[],
    modifiedSince?: string,
  ): Promise<ConfluencePage[]> {
    const allPages: ConfluencePage[] = [];
    let nextUrl: string | null = this.buildPagesUrl(spaceIds, modifiedSince);

    while (nextUrl) {
      const data: PaginatedResponse<ConfluencePage> = await this.apiFetch<PaginatedResponse<ConfluencePage>>(
        nextUrl,
      );
      allPages.push(...data.results);
      nextUrl = data._links?.next ?? null;
      if (allPages.length >= MAX_PAGES_PER_SYNC) break;
    }
    return allPages;
  }

  /** Fetch a single page by ID with storage-format body. */
  async fetchPageContent(
    pageId: string,
  ): Promise<{ title: string; bodyHtml: string; webUrl: string }> {
    const page = await this.apiFetch<ConfluencePage>(
      `/wiki/api/v2/pages/${pageId}?body-format=storage`,
    );
    const bodyHtml = page.body?.storage?.value ?? '';
    const webUrl = page._links?.webui
      ? `${this.baseUrl}${page._links.webui}`
      : `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${pageId}`;
    return { title: page.title, bodyHtml, webUrl };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /** Make a rate-limited, retried fetch to the Confluence API. */
  private async apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimiter.throttle();

      const response = await fetch(url, {
        ...opts,
        headers: {
          ...this.authHeaders(),
          Accept: 'application/json',
          ...(opts?.headers as Record<string, string> | undefined),
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get('Retry-After') ?? '5', 10,
        );
        await new Promise<void>((r) => setTimeout(r, retryAfter * 1_000));
        continue;
      }

      if (!response.ok) {
        lastError = new ConnectorError(
          'confluence',
          'apiFetch',
          `HTTP ${response.status} ${response.statusText}`,
        );
        if (attempt < MAX_RETRIES - 1) {
          await new Promise<void>((r) =>
            setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)),
          );
          continue;
        }
        throw lastError;
      }

      return (await response.json()) as T;
    }

    throw lastError ?? new ConnectorError(
      'confluence', 'apiFetch', 'Max retries exceeded',
    );
  }

  /** Build Authorization header based on auth mode. */
  private authHeaders(): Record<string, string> {
    if (this.auth.type === 'basic') {
      const encoded = btoa(`${this.auth.email}:${this.auth.apiToken}`);
      return { Authorization: `Basic ${encoded}` };
    }
    return { Authorization: `Bearer ${this.auth.accessToken}` };
  }

  /** Build the URL for fetching pages with optional filters. */
  private buildPagesUrl(
    spaceIds?: string[],
    modifiedSince?: string,
  ): string {
    const params = new URLSearchParams({
      'body-format': 'storage',
      limit: '25',
      status: 'current',
    });
    if (spaceIds?.length) {
      for (const id of spaceIds) params.append('space-id', id);
    }
    if (modifiedSince) {
      params.set('sort', '-modified-date');
    }
    return `/wiki/api/v2/pages?${params.toString()}`;
  }
}

