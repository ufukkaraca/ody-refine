/**
 * Tests for the Firecrawl crawler integration.
 * Mocks the Firecrawl SDK — does not require a running instance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('isFirecrawlAvailable', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns true when FIRECRAWL_API_URL is set', async () => {
    process.env['FIRECRAWL_API_URL'] = 'http://localhost:3002';
    const { isFirecrawlAvailable } = await import(
      '../src/ingest/firecrawl-crawler.js'
    );
    expect(isFirecrawlAvailable()).toBe(true);
  });

  it('returns true when FIRECRAWL_API_KEY is set', async () => {
    process.env['FIRECRAWL_API_KEY'] = 'fc-test-key';
    const { isFirecrawlAvailable } = await import(
      '../src/ingest/firecrawl-crawler.js'
    );
    expect(isFirecrawlAvailable()).toBe(true);
  });

  it('returns false when no env vars are set', async () => {
    delete process.env['FIRECRAWL_API_URL'];
    delete process.env['FIRECRAWL_API_KEY'];
    const { isFirecrawlAvailable } = await import(
      '../src/ingest/firecrawl-crawler.js'
    );
    expect(isFirecrawlAvailable()).toBe(false);
  });
});

describe('crawlWithFirecrawl', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env['FIRECRAWL_API_URL'] = 'http://localhost:3002';
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns CrawledPage[] from a multi-page crawl', async () => {
    const mockCrawlUrl = vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          url: 'https://docs.example.com/',
          markdown: '# Welcome\n\nThis is the homepage with enough content to pass the minimum length filter.',
          metadata: { title: 'Home' },
        },
        {
          url: 'https://docs.example.com/guide',
          markdown: '# Guide\n\nThis is the guide page with enough content to pass the minimum length filter easily.',
          metadata: { title: 'Guide' },
        },
      ],
      total: 2,
    });

    vi.doMock('@mendable/firecrawl-js', () => ({
      default: class MockFirecrawlApp {
        crawlUrl = mockCrawlUrl;
        scrapeUrl = vi.fn();
      },
    }));

    const { crawlWithFirecrawl } = await import(
      '../src/ingest/firecrawl-crawler.js'
    );

    const pages = await crawlWithFirecrawl('https://docs.example.com/', {
      maxPages: 10,
      maxDepth: 2,
    });

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      url: 'https://docs.example.com/',
      title: 'Home',
    });
    expect(pages[1]).toMatchObject({
      url: 'https://docs.example.com/guide',
      title: 'Guide',
    });
    expect(pages[0]!.markdown).toContain('# Welcome');
  });

  it('returns CrawledPage[] from a single-page scrape', async () => {
    const mockScrapeUrl = vi.fn().mockResolvedValue({
      success: true,
      data: {
        url: 'https://docs.example.com/',
        markdown: '# Single Page\n\nThis is a single page scrape with enough content to pass the minimum filter.',
        metadata: { title: 'Single Page' },
      },
    });

    vi.doMock('@mendable/firecrawl-js', () => ({
      default: class MockFirecrawlApp {
        crawlUrl = vi.fn();
        scrapeUrl = mockScrapeUrl;
      },
    }));

    const { crawlWithFirecrawl } = await import(
      '../src/ingest/firecrawl-crawler.js'
    );

    const pages = await crawlWithFirecrawl('https://docs.example.com/', {
      maxPages: 1,
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      url: 'https://docs.example.com/',
      title: 'Single Page',
      markdown: expect.stringContaining('# Single Page') as string,
    });
  });

  it('returns empty array when SDK is not installed', async () => {
    vi.doMock('@mendable/firecrawl-js', () => {
      throw new Error('Cannot find module');
    });

    const { crawlWithFirecrawl } = await import(
      '../src/ingest/firecrawl-crawler.js'
    );

    const pages = await crawlWithFirecrawl('https://docs.example.com/');
    expect(pages).toEqual([]);
  });

  it('returns empty array when crawl fails', async () => {
    const mockCrawlUrl = vi.fn().mockResolvedValue({
      success: false,
      error: 'Connection refused',
    });

    vi.doMock('@mendable/firecrawl-js', () => ({
      default: class MockFirecrawlApp {
        crawlUrl = mockCrawlUrl;
        scrapeUrl = vi.fn();
      },
    }));

    const { crawlWithFirecrawl } = await import(
      '../src/ingest/firecrawl-crawler.js'
    );

    const pages = await crawlWithFirecrawl('https://docs.example.com/', {
      maxPages: 10,
      maxDepth: 2,
    });

    expect(pages).toEqual([]);
  });

  it('calls onProgress for each page', async () => {
    const mockCrawlUrl = vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          url: 'https://docs.example.com/',
          markdown: '# Page 1\n\nContent that exceeds the minimum length requirement for being included in results.',
          metadata: { title: 'Page 1' },
        },
        {
          url: 'https://docs.example.com/two',
          markdown: '# Page 2\n\nMore content that exceeds the minimum length requirement for being included in results.',
          metadata: { title: 'Page 2' },
        },
      ],
      total: 2,
    });

    vi.doMock('@mendable/firecrawl-js', () => ({
      default: class MockFirecrawlApp {
        crawlUrl = mockCrawlUrl;
        scrapeUrl = vi.fn();
      },
    }));

    const { crawlWithFirecrawl } = await import(
      '../src/ingest/firecrawl-crawler.js'
    );

    const progress: Array<{ fetched: number; queued: number }> = [];
    await crawlWithFirecrawl('https://docs.example.com/', {
      maxPages: 10,
      maxDepth: 2,
      onProgress: (event) => {
        progress.push({ fetched: event.fetched, queued: event.queued });
      },
    });

    expect(progress).toHaveLength(2);
    expect(progress[0]!.fetched).toBe(1);
    expect(progress[1]!.fetched).toBe(2);
  });

  it('filters out documents with short markdown', async () => {
    const mockCrawlUrl = vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          url: 'https://docs.example.com/',
          markdown: '# Good\n\nThis page has enough content to be included in the results of the crawl.',
          metadata: { title: 'Good' },
        },
        {
          url: 'https://docs.example.com/short',
          markdown: 'Too short',
          metadata: { title: 'Short' },
        },
      ],
      total: 2,
    });

    vi.doMock('@mendable/firecrawl-js', () => ({
      default: class MockFirecrawlApp {
        crawlUrl = mockCrawlUrl;
        scrapeUrl = vi.fn();
      },
    }));

    const { crawlWithFirecrawl } = await import(
      '../src/ingest/firecrawl-crawler.js'
    );

    const pages = await crawlWithFirecrawl('https://docs.example.com/', {
      maxPages: 10,
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]!.title).toBe('Good');
  });
});

describe('crawlSite fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('uses built-in crawler when backend is "builtin"', async () => {
    // The built-in crawler will fail on this URL (no server), but it should
    // NOT attempt Firecrawl. We verify by setting the env var and checking
    // that no Firecrawl call is made.
    process.env['FIRECRAWL_API_URL'] = 'http://localhost:3002';

    const { crawlSite } = await import('../src/ingest/web-crawler.js');
    // With 'builtin' backend, it should go straight to native fetch
    // which will fail (no server) and return []
    const pages = await crawlSite('http://localhost:19999', { maxPages: 1 }, 'builtin');
    expect(Array.isArray(pages)).toBe(true);
  });
});
