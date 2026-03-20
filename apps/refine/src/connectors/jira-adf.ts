/**
 * Converts Atlassian Document Format (ADF) JSON to plain text / markdown.
 * Used for Jira issue descriptions and comments.
 * @module connectors/jira-adf
 */

/** ADF node structure from Jira REST API v3. */
export interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/** Convert an ADF document to plain-text markdown. */
export function adfToPlainText(doc: AdfNode | null | undefined): string {
  if (!doc || !doc.content) return '';
  return doc.content.map((node) => processNode(node)).join('').trim();
}

function processNode(node: AdfNode, listIndex?: number): string {
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'paragraph':
      return childrenText(node) + '\n';
    case 'heading': {
      const level = (node.attrs?.['level'] as number) || 1;
      const prefix = '#'.repeat(Math.min(level, 6));
      return `${prefix} ${childrenText(node)}\n`;
    }
    case 'hardBreak':
      return '\n';
    case 'bulletList':
      return (node.content ?? []).map((c) => processNode(c)).join('') + '\n';
    case 'orderedList':
      return (node.content ?? []).map((c, i) => processNode(c, i + 1)).join('') + '\n';
    case 'listItem': {
      const prefix = listIndex !== undefined ? `${listIndex}. ` : '- ';
      const inner = childrenText(node).replace(/\n$/, '');
      return `${prefix}${inner}\n`;
    }
    case 'codeBlock': {
      const lang = (node.attrs?.['language'] as string) || '';
      return `\`\`\`${lang}\n${childrenText(node)}\n\`\`\`\n`;
    }
    case 'blockquote':
      return childrenText(node)
        .split('\n')
        .filter(Boolean)
        .map((line) => `> ${line}`)
        .join('\n') + '\n';
    case 'table':
      return processTable(node) + '\n';
    case 'mention':
      return `@${(node.attrs?.['text'] as string) || 'unknown'}`;
    case 'inlineCard':
      return `[link](${(node.attrs?.['url'] as string) || ''})`;
    case 'panel': {
      const panelType = (node.attrs?.['panelType'] as string) || 'info';
      return `[${panelType.toUpperCase()}] ${childrenText(node)}\n`;
    }
    case 'expand': {
      const title = (node.attrs?.['title'] as string) || '';
      return `${title}\n${childrenText(node)}`;
    }
    case 'rule':
      return '---\n';
    case 'mediaGroup':
    case 'mediaSingle':
    case 'media':
      return '[media]\n';
    default:
      return childrenText(node);
  }
}

function childrenText(node: AdfNode): string {
  if (!node.content) return node.text ?? '';
  return node.content.map((child) => processNode(child)).join('');
}

function processTable(node: AdfNode): string {
  const rows: string[] = [];
  for (const row of node.content ?? []) {
    if (row.type !== 'tableRow') continue;
    const cells = (row.content ?? []).map((cell) =>
      childrenText(cell).replace(/\n/g, ' ').trim(),
    );
    rows.push(`| ${cells.join(' | ')} |`);
  }
  return rows.join('\n');
}
