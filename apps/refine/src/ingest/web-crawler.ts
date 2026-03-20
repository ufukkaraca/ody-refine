/**
 * Public docs web crawler — fetches pages, converts HTML to markdown.
 * Respects robots.txt, max depth, and page limits.
 * @module ingest/web-crawler
 */

/** A crawled page with its URL and markdown content. */
export interface CrawledPage {
  url: string;
  title: string;
  markdown: string;
}

/** Options for the web crawler. */
export interface CrawlOptions {
  maxPages: number;
  maxDepth: number;
  onProgress?: (event: CrawlProgressEvent) => void;
}

/** Progress events during crawling. */
export interface CrawlProgressEvent {
  url: string;
  fetched: number;
  queued: number;
}

/** Default crawl limits. */
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_MAX_DEPTH = 2;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch and parse robots.txt for a given origin.
 * Returns a set of disallowed path prefixes.
 */
async function fetchDisallowedPaths(origin: string): Promise<Set<string>> {
  const disallowed = new Set<string>();
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return disallowed;
    const text = await res.text();
    let isRelevantAgent = false;

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('user-agent:')) {
        const agent = trimmed.slice('user-agent:'.length).trim();
        isRelevantAgent = agent === '*';
      } else if (isRelevantAgent && trimmed.toLowerCase().startsWith('disallow:')) {
        const path = trimmed.slice('disallow:'.length).trim();
        if (path) disallowed.add(path);
      }
    }
  } catch {
    // robots.txt fetch failed — allow all
  }
  return disallowed;
}

/** Check if a URL path is disallowed by robots.txt rules. */
function isDisallowed(pathname: string, rules: Set<string>): boolean {
  for (const rule of rules) {
    if (pathname.startsWith(rule)) return true;
  }
  return false;
}

/** Strip HTML to markdown-like plaintext preserving structure. */
export function htmlToMarkdown(html: string): { title: string; markdown: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1]!.trim() : 'Untitled';

  // Remove script, style, nav, footer, header, aside elements
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Convert headings
  cleaned = cleaned.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  cleaned = cleaned.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  cleaned = cleaned.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  cleaned = cleaned.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  cleaned = cleaned.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  cleaned = cleaned.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // Convert lists
  cleaned = cleaned.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  cleaned = cleaned.replace(/<\/?[ou]l[^>]*>/gi, '\n');

  // Convert paragraphs and line breaks
  cleaned = cleaned.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<hr\s*\/?>/gi, '\n---\n');

  // Convert strong/em
  cleaned = cleaned.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  cleaned = cleaned.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');

  // Convert code blocks
  cleaned = cleaned.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  cleaned = cleaned.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Convert links — keep text only
  cleaned = cleaned.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // Strip remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Normalize whitespace
  const markdown = cleaned
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, markdown };
}

/** Extract same-origin links from HTML. */
function extractLinks(html: string, baseUrl: URL): string[] {
  const linkRegex = /href=["']([^"'#]+)["']/gi;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1]!, baseUrl);
      if (resolved.origin === baseUrl.origin && resolved.protocol.startsWith('http')) {
        // Strip fragment and query for dedup
        resolved.hash = '';
        links.push(resolved.href);
      }
    } catch {
      // Skip malformed URLs
    }
  }

  return links;
}

/** Crawler backend selection. */
export type CrawlerBackend = 'auto' | 'firecrawl' | 'builtin';

/** Crawl a public website. Backend 'auto' uses Firecrawl if available. */
export async function crawlSite(
  startUrl: string,
  options?: Partial<CrawlOptions>,
  backend: CrawlerBackend = 'auto',
): Promise<CrawledPage[]> {
  // Try Firecrawl when requested or auto-detected
  if (backend === 'firecrawl' || backend === 'auto') {
    const { isFirecrawlAvailable, crawlWithFirecrawl } = await import(
      './firecrawl-crawler.js'
    );
    if (backend === 'firecrawl' || isFirecrawlAvailable()) {
      try {
        const pages = await crawlWithFirecrawl(startUrl, options);
        if (pages.length > 0) return pages;
        // Fall through to built-in if Firecrawl returned nothing
      } catch {
        // Firecrawl failed — fall back to built-in
      }
    }
  }

  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;

  const start = new URL(startUrl);
  const disallowed = await fetchDisallowedPaths(start.origin);

  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  const queue: Array<{ url: string; depth: number }> = [
    { url: start.href, depth: 0 },
  ];

  while (queue.length > 0 && pages.length < maxPages) {
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    const parsed = new URL(item.url);
    if (isDisallowed(parsed.pathname, disallowed)) continue;

    // Skip non-HTML resources
    const ext = parsed.pathname.split('.').pop()?.toLowerCase() ?? '';
    if (['png', 'jpg', 'gif', 'svg', 'css', 'js', 'woff', 'pdf', 'zip'].includes(ext)) {
      continue;
    }

    try {
      const res = await fetch(item.url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'ody-refine/0.1.0 (knowledge-scanner)' },
      });
      if (!res.ok) continue;

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) continue;

      const html = await res.text();
      const { title, markdown } = htmlToMarkdown(html);

      if (markdown.length > 50) {
        pages.push({ url: item.url, title, markdown });
        options?.onProgress?.({
          url: item.url,
          fetched: pages.length,
          queued: queue.length,
        });
      }

      // Extract and queue links if within depth limit
      if (item.depth < maxDepth) {
        const links = extractLinks(html, parsed);
        for (const link of links) {
          if (!visited.has(link) && pages.length + queue.length < maxPages * 2) {
            queue.push({ url: link, depth: item.depth + 1 });
          }
        }
      }
    } catch {
      // Fetch failed — skip this URL
    }
  }

  return pages;
}
