/**
 * Notion block-to-markdown converter.
 * Converts Notion block objects into readable markdown.
 * Handles rich text formatting, nested blocks, and common block types.
 * @module connectors/notion-blocks
 */

/** Notion rich text annotation. */
interface RichTextAnnotation {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
}

/** Notion rich text object. */
interface NotionRichText {
  type: string;
  plain_text: string;
  annotations: RichTextAnnotation;
  href?: string | null;
}

/** A Notion block with optional children. */
export interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  children?: NotionBlock[];
  [key: string]: unknown;
}

/** Convert a Notion rich text array to markdown string. */
export function richTextToMarkdown(richTexts: NotionRichText[]): string {
  if (!richTexts || richTexts.length === 0) return '';
  return richTexts
    .map((rt) => {
      let text = rt.plain_text;
      if (!text) return '';
      const a = rt.annotations;
      if (a.code) text = `\`${text}\``;
      if (a.bold) text = `**${text}**`;
      if (a.italic) text = `*${text}*`;
      if (a.strikethrough) text = `~~${text}~~`;
      if (rt.href) text = `[${text}](${rt.href})`;
      return text;
    })
    .join('');
}

/** Extract rich text array from a block's type-specific data. */
function getBlockRichText(block: NotionBlock): NotionRichText[] {
  const data = block[block.type] as Record<string, unknown> | undefined;
  if (!data) return [];
  return (data.rich_text as NotionRichText[] | undefined) ?? [];
}

/** Convert children blocks to indented markdown. */
function childrenToMarkdown(
  children: NotionBlock[] | undefined,
  indent: string,
): string {
  if (!children || children.length === 0) return '';
  return children
    .map((child) => blockToMarkdown(child, indent))
    .filter(Boolean)
    .join('\n');
}

/** Convert a single Notion block to markdown. */
export function blockToMarkdown(
  block: NotionBlock,
  indent = '',
): string {
  const richText = getBlockRichText(block);
  const text = richTextToMarkdown(richText);
  const childMd = childrenToMarkdown(block.children, indent + '  ');
  const childSection = childMd ? `\n${childMd}` : '';

  switch (block.type) {
    case 'paragraph':
      return text ? `${indent}${text}\n${childSection}` : `\n${childSection}`;

    case 'heading_1':
      return `${indent}# ${text}\n`;

    case 'heading_2':
      return `${indent}## ${text}\n`;

    case 'heading_3':
      return `${indent}### ${text}\n`;

    case 'bulleted_list_item':
      return `${indent}- ${text}${childSection}`;

    case 'numbered_list_item':
      return `${indent}1. ${text}${childSection}`;

    case 'to_do': {
      const data = block.to_do as { checked?: boolean } | undefined;
      const checked = data?.checked ? 'x' : ' ';
      return `${indent}- [${checked}] ${text}${childSection}`;
    }

    case 'toggle':
      return `${indent}<details>\n${indent}<summary>${text}</summary>\n${childSection}\n${indent}</details>\n`;

    case 'code': {
      const data = block.code as { language?: string } | undefined;
      const lang = data?.language ?? '';
      return `${indent}\`\`\`${lang}\n${indent}${text}\n${indent}\`\`\`\n`;
    }

    case 'quote':
      return `${indent}> ${text}\n${childSection}`;

    case 'callout': {
      const data = block.callout as { icon?: { emoji?: string } } | undefined;
      const icon = data?.icon?.emoji ?? '';
      return `${indent}> ${icon} ${text}\n${childSection}`;
    }

    case 'divider':
      return `${indent}---\n`;

    case 'image': {
      const data = block.image as {
        type?: string;
        file?: { url?: string };
        external?: { url?: string };
        caption?: NotionRichText[];
      } | undefined;
      const url = data?.type === 'file'
        ? data.file?.url
        : data?.external?.url;
      const caption = data?.caption
        ? richTextToMarkdown(data.caption)
        : '';
      return url ? `${indent}![${caption}](${url})\n` : '';
    }

    case 'bookmark': {
      const data = block.bookmark as { url?: string } | undefined;
      return data?.url ? `${indent}[${data.url}](${data.url})\n` : '';
    }

    case 'table_of_contents':
      return `${indent}[TOC]\n`;

    case 'child_page': {
      const data = block.child_page as { title?: string } | undefined;
      return data?.title ? `${indent}**${data.title}**\n` : '';
    }

    case 'child_database': {
      const data = block.child_database as { title?: string } | undefined;
      return data?.title ? `${indent}**[Database: ${data.title}]**\n` : '';
    }

    case 'embed': {
      const data = block.embed as { url?: string } | undefined;
      return data?.url ? `${indent}[Embed: ${data.url}](${data.url})\n` : '';
    }

    default:
      return text ? `${indent}${text}\n` : '';
  }
}

/**
 * Convert a list of Notion blocks to a markdown string.
 * This is the main entry point for block-to-markdown conversion.
 */
export function blocksToMarkdown(blocks: NotionBlock[]): string {
  return blocks
    .map((block) => blockToMarkdown(block))
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
