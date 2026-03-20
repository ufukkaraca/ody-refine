/**
 * Notion export ingestion adapter.
 * Reads Notion HTML/Markdown export zip files and converts to ingestable content.
 * @module ingest/notion-import
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

/** A page extracted from a Notion export. */
export interface NotionPage {
  title: string;
  content: string;
  path: string;
}

/**
 * Extract pages from a Notion export directory.
 * Notion exports as nested directories with markdown or HTML files.
 * Each .md or .html file becomes a page.
 */
export function extractNotionPages(exportDir: string): NotionPage[] {
  const pages: NotionPage[] = [];
  walkDir(exportDir, pages);
  return pages;
}

/** Recursively walk directory and extract pages. */
function walkDir(dir: string, pages: NotionPage[]): void {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath, pages);
      continue;
    }

    const ext = extname(entry).toLowerCase();
    if (ext !== '.md' && ext !== '.html') continue;

    const raw = readFileSync(fullPath, 'utf-8');
    const content = ext === '.html' ? htmlToMarkdown(raw) : raw;

    // Notion filenames have UUIDs appended — strip them
    const title = cleanNotionTitle(basename(entry, ext));

    if (content.trim().length < 50) continue;

    pages.push({ title, content, path: fullPath });
  }
}

/** Clean Notion-style titles (strip trailing UUID hash). */
function cleanNotionTitle(name: string): string {
  // Notion exports: "My Page Title abc123def456.md" → "My Page Title"
  return name.replace(/\s+[a-f0-9]{32}$/i, '').trim() || name;
}

/** Convert basic HTML to markdown (Notion HTML exports). */
function htmlToMarkdown(html: string): string {
  let text = html;
  // Convert headings
  text = text.replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi,
    (_m, level: string, content: string) => `${'#'.repeat(parseInt(level, 10))} ${content.trim()}\n\n`);
  // Convert paragraphs
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  // Convert list items
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  // Convert bold
  text = text.replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi, '**$1**');
  // Convert italic
  text = text.replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi, '*$1*');
  // Convert code
  text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  // Convert links
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
  // Clean whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
