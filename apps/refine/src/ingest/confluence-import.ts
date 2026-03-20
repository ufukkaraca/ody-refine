/**
 * Confluence export ingestion adapter.
 * Reads Confluence HTML export directories and converts to ingestable content.
 * @module ingest/confluence-import
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { resolve } from 'node:path';

/** A page extracted from a Confluence export. */
export interface ConfluencePage {
  title: string;
  content: string;
  path: string;
  spaceKey?: string;
}

/**
 * Extract pages from a Confluence HTML export directory.
 * Confluence exports as a flat or nested directory of HTML files + attachments.
 */
export function extractConfluencePages(
  exportDir: string,
  maxPages?: number,
): ConfluencePage[] {
  const absDir = resolve(exportDir);
  const pages: ConfluencePage[] = [];
  walkDir(absDir, pages, maxPages ?? 500);
  return pages;
}

/** Recursively walk and extract HTML pages. */
function walkDir(dir: string, pages: ConfluencePage[], max: number): void {
  if (pages.length >= max) return;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (pages.length >= max) return;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip images/attachments directories
      if (entry === 'images' || entry === 'attachments') continue;
      walkDir(fullPath, pages, max);
      continue;
    }

    if (extname(entry).toLowerCase() !== '.html') continue;

    const raw = readFileSync(fullPath, 'utf-8');
    const content = confluenceHtmlToMarkdown(raw);

    // Extract title from HTML <title> or filename
    const titleMatch = raw.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1]!.replace(/\s*[-–—]\s*Confluence.*$/i, '').trim()
      : cleanConfluenceFilename(basename(entry, '.html'));

    if (content.trim().length < 50) continue;

    pages.push({ title, content, path: fullPath });
  }
}

/** Clean Confluence-style filenames (strip page IDs). */
function cleanConfluenceFilename(name: string): string {
  return name
    .replace(/_\d{5,}$/, '') // Strip trailing page IDs
    .replace(/-/g, ' ')
    .trim() || name;
}

/** Convert Confluence HTML to markdown. */
function confluenceHtmlToMarkdown(html: string): string {
  let text = html;
  // Remove head/style/script sections
  text = text.replace(/<head[\s\S]*?<\/head>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Remove Confluence-specific UI elements
  text = text.replace(/<div[^>]*class="[^"]*(?:page-metadata|breadcrumb|footer)[^"]*"[\s\S]*?<\/div>/gi, '');
  // Convert headings
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi,
    (_m, level: string, content: string) => `${'#'.repeat(parseInt(level, 10))} ${content.replace(/<[^>]+>/g, '').trim()}\n\n`);
  // Convert paragraphs
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, c: string) => c.replace(/<[^>]+>/g, '').trim() + '\n\n');
  // Convert list items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, c: string) => '- ' + c.replace(/<[^>]+>/g, '').trim() + '\n');
  // Convert table cells
  text = text.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (_m, c: string) => c.replace(/<[^>]+>/g, '').trim() + ' | ');
  text = text.replace(/<tr[^>]*>/gi, '\n');
  // Convert bold/italic/code
  text = text.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  text = text.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Clean whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}
