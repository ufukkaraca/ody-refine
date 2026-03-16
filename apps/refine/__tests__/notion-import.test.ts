import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractNotionPages } from '../src/ingest/notion-import.js';

const TMP = join(tmpdir(), 'ody-notion-test-' + Date.now().toString(36));
const LONG = 'This is content that is long enough to pass the minimum 50 character threshold for page extraction filtering.';

describe('extractNotionPages', () => {
  beforeEach(() => {
    mkdirSync(join(TMP, 'nested'), { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('extracts markdown pages', () => {
    writeFileSync(join(TMP, 'My Page abcdef01234567890123456789012345.md'), `# Hello\n\n${LONG}`);
    const pages = extractNotionPages(TMP);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.title).toBe('My Page');
    expect(pages[0]!.content).toContain('Hello');
  });

  it('extracts HTML pages and converts to markdown', () => {
    writeFileSync(join(TMP, 'Test Page.html'), `<h1>Title</h1><p>${LONG}</p>`);
    const pages = extractNotionPages(TMP);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.content).toContain('# Title');
  });

  it('walks nested directories', () => {
    writeFileSync(join(TMP, 'top.md'), `# Top\n\n${LONG}`);
    writeFileSync(join(TMP, 'nested', 'sub.md'), `# Sub\n\n${LONG}`);
    const pages = extractNotionPages(TMP);
    expect(pages).toHaveLength(2);
  });

  it('strips UUID from filename for title', () => {
    writeFileSync(join(TMP, 'Getting Started abcdef01234567890123456789012345.md'), `# Getting Started\n\n${LONG}`);
    const pages = extractNotionPages(TMP);
    expect(pages[0]!.title).toBe('Getting Started');
  });

  it('skips files under 50 characters', () => {
    writeFileSync(join(TMP, 'tiny.md'), 'Hi');
    const pages = extractNotionPages(TMP);
    expect(pages).toHaveLength(0);
  });

  it('ignores non-md/html files', () => {
    writeFileSync(join(TMP, 'data.csv'), `a,b,c\n${LONG}`);
    const pages = extractNotionPages(TMP);
    expect(pages).toHaveLength(0);
  });
});
