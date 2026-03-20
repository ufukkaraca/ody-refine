/**
 * Converts Teams HTML message body to plain text.
 * Teams messages use HTML contentType with custom elements.
 * @module connectors/teams-html
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(?:amp|lt|gt|quot|nbsp|#39);/g,
    (match) => HTML_ENTITY_MAP[match] || match,
  );
}

/** Convert Teams HTML message content to plain text. */
export function teamsHtmlToText(html: string): string {
  if (!html) return '';
  let text = html;

  // Handle <at> mentions
  text = text.replace(/<at\b[^>]*>(.*?)<\/at>/gi, '@$1');
  // Handle <attachment> refs
  text = text.replace(/<attachment\b[^>]*>.*?<\/attachment>/gi, '[attachment]');
  text = text.replace(/<attachment\b[^>]*\/?>/gi, '[attachment]');
  // Handle <a href="...">text</a>
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi,
    '[$2]($1)',
  );
  // Block-level elements
  text = text.replace(/<\/(?:div|p|h[1-6])>/gi, '\n');
  text = text.replace(/<(?:div|p|h[1-6])\b[^>]*>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // List items
  text = text.replace(/<li\b[^>]*>/gi, '- ');
  text = text.replace(/<\/li>/gi, '\n');
  // Remove list containers
  text = text.replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '');
  // Strip formatting tags
  text = text.replace(/<\/?(?:b|i|em|strong|span|code|pre|u|s|del)\b[^>]*>/gi, '');
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}
