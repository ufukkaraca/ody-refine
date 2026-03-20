/**
 * Minimal type stub for @mendable/firecrawl-js (optional dependency).
 * Only used to satisfy TypeScript when the package is not installed.
 */
declare module '@mendable/firecrawl-js' {
  interface FirecrawlDocument {
    url?: string;
    markdown?: string;
    metadata?: Record<string, unknown>;
  }

  interface ScrapeResponse {
    success: boolean;
    data?: FirecrawlDocument;
    error?: string;
  }

  interface CrawlResponse {
    success: boolean;
    data?: FirecrawlDocument[];
    status?: string;
    total?: number;
    completed?: number;
    error?: string;
  }

  export default class FirecrawlApp {
    constructor(opts: { apiKey: string; apiUrl?: string });
    scrapeUrl(
      url: string,
      params?: Record<string, unknown>,
    ): Promise<ScrapeResponse>;
    crawlUrl(
      url: string,
      params?: Record<string, unknown>,
      pollInterval?: number,
    ): Promise<CrawlResponse>;
  }
}
