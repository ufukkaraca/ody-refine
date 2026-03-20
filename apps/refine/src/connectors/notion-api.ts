/**
 * Notion API helper — wraps @notionhq/client with rate limiting.
 * Handles optional SDK import and provides typed wrappers.
 * @module connectors/notion-api
 */
import { ConnectorError } from './types.js';
import type { NotionBlock } from './notion-blocks.js';

/** Notion API version header value. */
const NOTION_API_VERSION = '2022-06-28';

/** Conservative rate limit: 3 requests per second. */
const RATE_LIMIT_DELAY_MS = 340; // ~3 req/sec

/** Type for the Notion SDK client instance. */
type NotionClient = {
  search: (params: Record<string, unknown>) => Promise<NotionSearchResponse>;
  pages: { retrieve: (params: { page_id: string }) => Promise<NotionPage> };
  blocks: {
    children: {
      list: (params: { block_id: string; start_cursor?: string }) => Promise<NotionBlockList>;
    };
  };
  databases: {
    query: (params: { database_id: string; start_cursor?: string; sorts?: unknown[] }) => Promise<NotionQueryResponse>;
  };
  comments: {
    create: (params: {
      parent: { page_id: string };
      rich_text: Array<{ type: 'text'; text: { content: string } }>;
    }) => Promise<{ id: string; parent: { page_id: string } }>;
  };
  users: { me: () => Promise<{ id: string; name?: string }> };
};

/** Notion search API response shape. */
interface NotionSearchResponse {
  results: Array<{ id: string; object: string; [key: string]: unknown }>;
  has_more: boolean;
  next_cursor: string | null;
}

/** Notion page object shape. */
interface NotionPage {
  id: string;
  object: string;
  url: string;
  last_edited_time: string;
  last_edited_by?: { id: string; name?: string };
  properties: Record<string, unknown>;
  parent: { type: string; [key: string]: unknown };
}

/** Notion block list response. */
interface NotionBlockList {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

/** Notion database query response. */
interface NotionQueryResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

export type {
  NotionClient, NotionPage, NotionSearchResponse,
  NotionBlockList, NotionQueryResponse,
};

/**
 * Try to load the Notion SDK. Returns null if not installed.
 * Users must install @notionhq/client as an optional dependency.
 */
export async function loadNotionSdk(): Promise<{
  Client: new (opts: { auth: string }) => NotionClient;
} | null> {
  try {
    const mod = await import('@notionhq/client') as unknown as {
      Client: new (opts: { auth: string }) => NotionClient;
    };
    return mod;
  } catch {
    return null;
  }
}

/** Rate limiter: ensures minimum delay between API calls. */
export class RateLimiter {
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
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.delayMs - elapsed),
      );
    }
    this.lastCallAt = Date.now();
  }
}

/**
 * Validate a Notion API token by calling users/me.
 * Works without the SDK by using plain fetch.
 */
export async function validateNotionToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch all blocks for a page, handling pagination and nested children.
 */
export async function fetchAllBlocks(
  client: NotionClient,
  blockId: string,
  rateLimiter: RateLimiter,
  depth = 0,
): Promise<NotionBlock[]> {
  if (depth > 3) return []; // prevent infinite recursion

  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    await rateLimiter.throttle();
    const response = await client.blocks.children.list({
      block_id: blockId,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const block of response.results) {
      if (block.has_children) {
        block.children = await fetchAllBlocks(
          client, block.id, rateLimiter, depth + 1,
        );
      }
      blocks.push(block);
    }
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return blocks;
}

/**
 * Extract a page title from Notion page properties.
 * Notion stores titles in a 'title' property type.
 */
export function extractPageTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    const p = prop as { type?: string; title?: Array<{ plain_text: string }> };
    if (p.type === 'title' && p.title && p.title.length > 0) {
      return p.title.map((t) => t.plain_text).join('');
    }
  }
  return 'Untitled';
}

/**
 * Ensure the Notion SDK is available or throw a helpful error.
 */
export function ensureSdkAvailable(
  sdk: Awaited<ReturnType<typeof loadNotionSdk>>,
): asserts sdk is NonNullable<typeof sdk> {
  if (!sdk) {
    throw new ConnectorError(
      'notion',
      'initialize',
      'Install @notionhq/client to use the Notion connector:\n' +
      '  npm install @notionhq/client\n' +
      '  # or: pnpm add @notionhq/client',
    );
  }
}
