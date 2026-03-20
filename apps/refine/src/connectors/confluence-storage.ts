/**
 * Confluence XHTML storage format to Markdown converter.
 * Regex-based approach — no XML parser dependency.
 * @module connectors/confluence-storage
 */

/** Decode common HTML entities. */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code as string, 10)),
    );
}

/**
 * Convert Confluence XHTML storage format to Markdown.
 * Handles headings, lists, links, tables, code blocks, panels,
 * Confluence-specific macros, and page links.
 */
export function confluenceStorageToMarkdown(html: string): string {
  let text = html;

  // TOC macros
  text = text.replace(
    /<ac:structured-macro ac:name="toc"[^>]*>[\s\S]*?<\/ac:structured-macro>/gi,
    '',
  );
  // Code blocks
  text = text.replace(
    /<ac:structured-macro ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    '\n```\n$1\n```\n',
  );
  // Panel macros
  text = text.replace(
    /<ac:structured-macro ac:name="panel"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    '\n---\n$1\n---\n',
  );
  // Remaining structured macros
  text = text.replace(
    /<ac:structured-macro[^>]*>[\s\S]*?<\/ac:structured-macro>/gi,
    '',
  );
  // Confluence page links
  text = text.replace(
    /<ac:link>[\s\S]*?<ri:page[^>]*ri:content-title="([^"]*)"[^>]*\/>[\s\S]*?<\/ac:link>/gi,
    '[$1]',
  );
  text = text.replace(/<ac:link>[\s\S]*?<\/ac:link>/gi, '');
  // Headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');
  // Tables
  text = text.replace(
    /<table[^>]*>([\s\S]*?)<\/table>/gi,
    (_match, inner: string) => {
      const rows: string[] = [];
      const rowMatches = inner.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
      for (const row of rowMatches) {
        const cells = (
          row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []
        ).map((cell) => cell.replace(/<[^>]+>/g, '').trim());
        rows.push(`| ${cells.join(' | ')} |`);
      }
      return '\n' + rows.join('\n') + '\n';
    },
  );
  // Lists
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
  text = text.replace(/<\/?[uo]l[^>]*>/gi, '\n');
  // Links
  text = text.replace(
    /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    '[$2]($1)',
  );
  // Line breaks and paragraphs
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode entities
  text = decodeHtmlEntities(text);
  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}
