/**
 * Firecrawl-powered web crawler — optional upgrade over the built-in crawler.
 * Uses Firecrawl's scrape/crawl APIs for JS rendering and high-quality markdown.
 * Falls back to built-in crawler if Firecrawl is unavailable.
 * @module ingest/firecrawl-crawler
 */
import type { CrawledPage, CrawlOptions } from './web-crawler.js';

/** Firecrawl document shape (subset of what the SDK returns). */
interface FirecrawlDocument {
  url?: string;
  markdown?: string;
  metadata?: {
    title?: string;
    [key: string]: unknown;
  };
}

/** Firecrawl scrape response shape. */
interface FirecrawlScrapeResponse {
  success: boolean;
  data?: FirecrawlDocument;
  error?: string;
}

/** Firecrawl crawl response shape. */
interface FirecrawlCrawlResponse {
  success: boolean;
  data?: FirecrawlDocument[];
  status?: string;
  total?: number;
  completed?: number;
  error?: string;
}

/** Firecrawl SDK client interface (minimal subset). */
interface FirecrawlClient {
  scrapeUrl(
    url: string,
    params?: Record<string, unknown>,
  ): Promise<FirecrawlScrapeResponse>;
  crawlUrl(
    url: string,
    params?: Record<string, unknown>,
    pollInterval?: number,
  ): Promise<FirecrawlCrawlResponse>;
}

/**
 * Check whether Firecrawl is available.
 * Returns true if FIRECRAWL_API_URL or FIRECRAWL_API_KEY is set.
 */
export function isFirecrawlAvailable(): boolean {
  return !!(process.env['FIRECRAWL_API_URL'] || process.env['FIRECRAWL_API_KEY']);
}

/**
 * Dynamically load the Firecrawl SDK.
 * Returns null if the package is not installed.
 */
async function loadFirecrawlClient(): Promise<FirecrawlClient | null> {
  try {
    const mod = await import('@mendable/firecrawl-js');
    const FirecrawlApp = mod.default;
    const apiUrl = process.env['FIRECRAWL_API_URL'];
    const apiKey = process.env['FIRECRAWL_API_KEY'] ?? 'fc-ody-self-hosted';

    return new FirecrawlApp({
      apiKey,
      ...(apiUrl ? { apiUrl } : {}),
    }) as FirecrawlClient;
  } catch {
    return null;
  }
}

/** Convert a Firecrawl document to a CrawledPage. */
function toCrawledPage(doc: FirecrawlDocument): CrawledPage | null {
  const url = doc.url ?? '';
  const markdown = doc.markdown ?? '';
  const title = doc.metadata?.title as string | undefined ?? 'Untitled';

  if (!url || markdown.length < 50) return null;
  return { url, title, markdown };
}

/**
 * Crawl a website using Firecrawl.
 * For single-page URLs (no path or just /), uses scrape().
 * For sites, uses crawl() with the configured limits.
 */
export async function crawlWithFirecrawl(
  url: string,
  options?: Partial<CrawlOptions>,
): Promise<CrawledPage[]> {
  const client = await loadFirecrawlClient();
  if (!client) return [];

  const maxPages = options?.maxPages ?? 50;
  const parsed = new URL(url);
  const isSinglePage = parsed.pathname === '/' || parsed.pathname === '';

  // Single-page scrape
  if (isSinglePage && maxPages <= 1) {
    return scrapeOne(client, url);
  }

  // Multi-page crawl
  return crawlMany(client, url, options);
}

/** Scrape a single URL via Firecrawl. */
async function scrapeOne(
  client: FirecrawlClient,
  url: string,
): Promise<CrawledPage[]> {
  const response = await client.scrapeUrl(url, {
    formats: ['markdown'],
  });

  if (!response.success || !response.data) return [];

  const page = toCrawledPage(response.data);
  return page ? [page] : [];
}

/** Crawl multiple pages via Firecrawl. */
async function crawlMany(
  client: FirecrawlClient,
  url: string,
  options?: Partial<CrawlOptions>,
): Promise<CrawledPage[]> {
  const maxPages = options?.maxPages ?? 50;
  const maxDepth = options?.maxDepth ?? 2;

  const response = await client.crawlUrl(
    url,
    {
      limit: maxPages,
      maxDepth,
      scrapeOptions: { formats: ['markdown'] },
    },
    2,
  );

  if (!response.success || !response.data) return [];

  const pages: CrawledPage[] = [];
  for (const doc of response.data) {
    const page = toCrawledPage(doc);
    if (page) {
      pages.push(page);
      options?.onProgress?.({
        url: page.url,
        fetched: pages.length,
        queued: (response.total ?? 0) - pages.length,
      });
    }
  }

  return pages;
}
