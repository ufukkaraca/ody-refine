/**
 * Tests for the web crawler HTML→markdown conversion.
 */
import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../src/ingest/web-crawler.js';

describe('htmlToMarkdown', () => {
  it('extracts title from <title> tag', () => {
    const { title } = htmlToMarkdown('<html><head><title>My Page</title></head><body>Hello</body></html>');
    expect(title).toBe('My Page');
  });

  it('returns Untitled when no title tag', () => {
    const { title } = htmlToMarkdown('<html><body>Hello</body></html>');
    expect(title).toBe('Untitled');
  });

  it('converts headings to markdown', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('# Title');
    expect(markdown).toContain('## Subtitle');
    expect(markdown).toContain('### Section');
  });

  it('converts paragraphs to text blocks', () => {
    const html = '<p>First paragraph.</p><p>Second paragraph.</p>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('First paragraph.');
    expect(markdown).toContain('Second paragraph.');
  });

  it('converts list items', () => {
    const html = '<ul><li>Item one</li><li>Item two</li></ul>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('- Item one');
    expect(markdown).toContain('- Item two');
  });

  it('strips script and style tags', () => {
    const html = '<p>Content</p><script>alert("x")</script><style>.x{}</style>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toBe('Content');
  });

  it('strips nav, footer, header, aside', () => {
    const html = '<nav>Nav</nav><main><p>Main content</p></main><footer>Foot</footer>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).not.toContain('Nav');
    expect(markdown).not.toContain('Foot');
    expect(markdown).toContain('Main content');
  });

  it('converts bold and italic', () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em></p>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('**Bold**');
    expect(markdown).toContain('*italic*');
  });

  it('converts inline code', () => {
    const html = '<p>Use <code>npm install</code> to install.</p>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('`npm install`');
  });

  it('decodes HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;</p>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toBe('A & B < C > D "E" \'F\'');
  });

  it('normalizes excessive whitespace', () => {
    const html = '<p>One</p>\n\n\n\n\n<p>Two</p>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).not.toMatch(/\n{3,}/);
  });

  it('strips remaining HTML tags', () => {
    const html = '<div class="wrapper"><span>Text</span></div>';
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toBe('Text');
    expect(markdown).not.toContain('<');
  });

  it('handles empty HTML', () => {
    const { markdown, title } = htmlToMarkdown('');
    expect(title).toBe('Untitled');
    expect(markdown).toBe('');
  });
});
