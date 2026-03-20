/**
 * Tests for the Notion connector: block-to-markdown, rate limiter, API helpers.
 * Mocks the Notion SDK — does not require actual API access.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NotionBlock } from '../src/connectors/notion-blocks.js';
import {
  richTextToMarkdown,
  blockToMarkdown,
  blocksToMarkdown,
} from '../src/connectors/notion-blocks.js';
import {
  RateLimiter,
  fetchAllBlocks,
  extractPageTitle,
  ensureSdkAvailable,
} from '../src/connectors/notion-api.js';
import type { NotionClient, NotionPage } from '../src/connectors/notion-api.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a minimal NotionRichText array. */
function rt(
  text: string,
  opts?: {
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    strikethrough?: boolean;
    href?: string;
  },
): Array<{ type: string; plain_text: string; annotations: Record<string, boolean>; href?: string | null }> {
  return [
    {
      type: 'text',
      plain_text: text,
      annotations: {
        bold: opts?.bold ?? false,
        italic: opts?.italic ?? false,
        code: opts?.code ?? false,
        strikethrough: opts?.strikethrough ?? false,
        underline: false,
      },
      href: opts?.href ?? null,
    },
  ];
}

/** Build a minimal Notion block. */
function makeBlock(
  type: string,
  richText: ReturnType<typeof rt>,
  extra?: Record<string, unknown>,
): NotionBlock {
  return {
    id: crypto.randomUUID(),
    type,
    has_children: false,
    [type]: { rich_text: richText, ...extra },
  };
}

// ---------------------------------------------------------------------------
// richTextToMarkdown
// ---------------------------------------------------------------------------

describe('richTextToMarkdown', () => {
  it('returns empty string for empty array', () => {
    expect(richTextToMarkdown([])).toBe('');
  });

  it('handles plain text', () => {
    expect(richTextToMarkdown(rt('hello'))).toBe('hello');
  });

  it('wraps bold text', () => {
    expect(richTextToMarkdown(rt('bold', { bold: true }))).toBe('**bold**');
  });

  it('wraps italic text', () => {
    expect(richTextToMarkdown(rt('em', { italic: true }))).toBe('*em*');
  });

  it('wraps inline code', () => {
    expect(richTextToMarkdown(rt('fn()', { code: true }))).toBe('`fn()`');
  });

  it('wraps links', () => {
    expect(richTextToMarkdown(rt('click', { href: 'https://example.com' }))).toBe(
      '[click](https://example.com)',
    );
  });

  it('wraps strikethrough', () => {
    expect(richTextToMarkdown(rt('old', { strikethrough: true }))).toBe('~~old~~');
  });

  it('combines bold + italic + link', () => {
    const result = richTextToMarkdown(rt('combo', { bold: true, italic: true, href: 'https://x.co' }));
    expect(result).toContain('**');
    expect(result).toContain('*');
    expect(result).toContain('[');
    expect(result).toContain('https://x.co');
  });

  it('concatenates multiple rich text segments', () => {
    const segments = [
      ...rt('hello '),
      ...rt('world', { bold: true }),
    ];
    expect(richTextToMarkdown(segments)).toBe('hello **world**');
  });
});

// ---------------------------------------------------------------------------
// blockToMarkdown
// ---------------------------------------------------------------------------

describe('blockToMarkdown', () => {
  it('converts paragraph block', () => {
    const block = makeBlock('paragraph', rt('Hello world'));
    const md = blockToMarkdown(block);
    expect(md).toContain('Hello world');
  });

  it('converts heading_1 block', () => {
    const block = makeBlock('heading_1', rt('Title'));
    expect(blockToMarkdown(block)).toContain('# Title');
  });

  it('converts heading_2 block', () => {
    const block = makeBlock('heading_2', rt('Subtitle'));
    expect(blockToMarkdown(block)).toContain('## Subtitle');
  });

  it('converts heading_3 block', () => {
    const block = makeBlock('heading_3', rt('Section'));
    expect(blockToMarkdown(block)).toContain('### Section');
  });

  it('converts bulleted_list_item', () => {
    const block = makeBlock('bulleted_list_item', rt('item one'));
    expect(blockToMarkdown(block)).toContain('- item one');
  });

  it('converts numbered_list_item', () => {
    const block = makeBlock('numbered_list_item', rt('first step'));
    expect(blockToMarkdown(block)).toContain('1. first step');
  });

  it('converts code block with language', () => {
    const block = makeBlock('code', rt('const x = 1;'), { language: 'typescript' });
    const md = blockToMarkdown(block);
    expect(md).toContain('```typescript');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('```');
  });

  it('converts quote block', () => {
    const block = makeBlock('quote', rt('important note'));
    expect(blockToMarkdown(block)).toContain('> important note');
  });

  it('converts to_do block (unchecked)', () => {
    const block: NotionBlock = {
      id: crypto.randomUUID(),
      type: 'to_do',
      has_children: false,
      to_do: { rich_text: rt('task'), checked: false },
    };
    expect(blockToMarkdown(block)).toContain('- [ ] task');
  });

  it('converts to_do block (checked)', () => {
    const block: NotionBlock = {
      id: crypto.randomUUID(),
      type: 'to_do',
      has_children: false,
      to_do: { rich_text: rt('done'), checked: true },
    };
    expect(blockToMarkdown(block)).toContain('- [x] done');
  });

  it('converts divider block', () => {
    const block: NotionBlock = {
      id: crypto.randomUUID(),
      type: 'divider',
      has_children: false,
    };
    expect(blockToMarkdown(block)).toContain('---');
  });

  it('handles nested children (indentation)', () => {
    const child = makeBlock('paragraph', rt('child text'));
    const parent: NotionBlock = {
      ...makeBlock('bulleted_list_item', rt('parent')),
      has_children: true,
      children: [child],
    };
    const md = blockToMarkdown(parent);
    expect(md).toContain('- parent');
    expect(md).toContain('child text');
  });
});

// ---------------------------------------------------------------------------
// blocksToMarkdown
// ---------------------------------------------------------------------------

describe('blocksToMarkdown', () => {
  it('joins multiple blocks into a single markdown string', () => {
    const blocks = [
      makeBlock('heading_1', rt('Title')),
      makeBlock('paragraph', rt('Some paragraph content here')),
      makeBlock('bulleted_list_item', rt('item')),
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('# Title');
    expect(md).toContain('Some paragraph content here');
    expect(md).toContain('- item');
  });

  it('collapses triple newlines', () => {
    const blocks = [
      makeBlock('paragraph', rt('A')),
      makeBlock('paragraph', rt('')),
      makeBlock('paragraph', rt('B')),
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it('handles empty blocks array', () => {
    expect(blocksToMarkdown([])).toBe('');
  });
});

// ---------------------------------------------------------------------------
// RateLimiter
// ---------------------------------------------------------------------------

describe('RateLimiter', () => {
  it('does not delay the first call', async () => {
    const limiter = new RateLimiter(100);
    const start = Date.now();
    await limiter.throttle();
    const elapsed = Date.now() - start;
    // First call should be nearly instant (< 50ms margin)
    expect(elapsed).toBeLessThan(50);
  });

  it('delays subsequent calls to respect rate limit', async () => {
    const delayMs = 100;
    const limiter = new RateLimiter(delayMs);
    await limiter.throttle(); // first — no delay
    const start = Date.now();
    await limiter.throttle(); // second — should delay
    const elapsed = Date.now() - start;
    // Should have waited at least ~80ms (with margin for timing)
    expect(elapsed).toBeGreaterThanOrEqual(delayMs - 30);
  });
});

// ---------------------------------------------------------------------------
// fetchAllBlocks
// ---------------------------------------------------------------------------

describe('fetchAllBlocks', () => {
  it('fetches blocks and recursively fetches children', async () => {
    const childBlock: NotionBlock = {
      id: 'child-1',
      type: 'paragraph',
      has_children: false,
      paragraph: { rich_text: rt('child content') },
    };
    const parentBlock: NotionBlock = {
      id: 'parent-1',
      type: 'bulleted_list_item',
      has_children: true,
      bulleted_list_item: { rich_text: rt('parent') },
    };

    const mockClient: NotionClient = {
      search: vi.fn(),
      pages: { retrieve: vi.fn() },
      blocks: {
        children: {
          list: vi.fn()
            .mockResolvedValueOnce({
              results: [parentBlock],
              has_more: false,
              next_cursor: null,
            })
            .mockResolvedValueOnce({
              results: [childBlock],
              has_more: false,
              next_cursor: null,
            }),
        },
      },
      databases: { query: vi.fn() },
      users: { me: vi.fn() },
    };

    const limiter = new RateLimiter(0);
    const blocks = await fetchAllBlocks(mockClient, 'page-id', limiter);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.id).toBe('parent-1');
    expect(blocks[0]!.children).toHaveLength(1);
    expect(blocks[0]!.children![0]!.id).toBe('child-1');
  });

  it('handles pagination with has_more / next_cursor', async () => {
    const block1: NotionBlock = { id: 'b1', type: 'paragraph', has_children: false };
    const block2: NotionBlock = { id: 'b2', type: 'paragraph', has_children: false };

    const mockClient: NotionClient = {
      search: vi.fn(),
      pages: { retrieve: vi.fn() },
      blocks: {
        children: {
          list: vi.fn()
            .mockResolvedValueOnce({
              results: [block1],
              has_more: true,
              next_cursor: 'cursor-abc',
            })
            .mockResolvedValueOnce({
              results: [block2],
              has_more: false,
              next_cursor: null,
            }),
        },
      },
      databases: { query: vi.fn() },
      users: { me: vi.fn() },
    };

    const limiter = new RateLimiter(0);
    const blocks = await fetchAllBlocks(mockClient, 'page-id', limiter);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.id).toBe('b1');
    expect(blocks[1]!.id).toBe('b2');
  });

  it('respects maximum recursion depth', async () => {
    const deepBlock: NotionBlock = { id: 'deep', type: 'paragraph', has_children: true };

    const listFn = vi.fn().mockResolvedValue({
      results: [deepBlock],
      has_more: false,
      next_cursor: null,
    });

    const mockClient: NotionClient = {
      search: vi.fn(),
      pages: { retrieve: vi.fn() },
      blocks: { children: { list: listFn } },
      databases: { query: vi.fn() },
      users: { me: vi.fn() },
    };

    const limiter = new RateLimiter(0);
    // depth=3: fetches current level but children call at depth=4 returns []
    const blocks = await fetchAllBlocks(mockClient, 'page-id', limiter, 3);
    // Block is returned but has no children (recursion stopped at depth 4)
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.children).toEqual([]);
    // list was called once for depth=3, but NOT for depth=4
    expect(listFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// extractPageTitle
// ---------------------------------------------------------------------------

describe('extractPageTitle', () => {
  it('extracts title from page properties', () => {
    const page: NotionPage = {
      id: 'p1',
      object: 'page',
      url: 'https://notion.so/p1',
      last_edited_time: '2026-01-01T00:00:00Z',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'My Page' }] },
      },
      parent: { type: 'workspace' },
    };
    expect(extractPageTitle(page)).toBe('My Page');
  });

  it('concatenates multi-segment titles', () => {
    const page: NotionPage = {
      id: 'p2',
      object: 'page',
      url: 'https://notion.so/p2',
      last_edited_time: '2026-01-01T00:00:00Z',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Part ' }, { plain_text: 'Two' }],
        },
      },
      parent: { type: 'workspace' },
    };
    expect(extractPageTitle(page)).toBe('Part Two');
  });

  it('returns Untitled when no title property exists', () => {
    const page: NotionPage = {
      id: 'p3',
      object: 'page',
      url: 'https://notion.so/p3',
      last_edited_time: '2026-01-01T00:00:00Z',
      properties: {
        Status: { type: 'select' },
      },
      parent: { type: 'workspace' },
    };
    expect(extractPageTitle(page)).toBe('Untitled');
  });
});

// ---------------------------------------------------------------------------
// ensureSdkAvailable
// ---------------------------------------------------------------------------

describe('ensureSdkAvailable', () => {
  it('throws ConnectorError when sdk is null', () => {
    expect(() => ensureSdkAvailable(null)).toThrow('Install @notionhq/client');
  });

  it('does not throw when sdk is present', () => {
    const fakeSdk = { Client: class {} };
    expect(() => ensureSdkAvailable(fakeSdk as never)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NotionConnector (listSources, fetchDocuments)
// ---------------------------------------------------------------------------

describe('NotionConnector', () => {
  let connector: InstanceType<typeof import('../src/connectors/notion.js').NotionConnector>;

  beforeEach(async () => {
    const { NotionConnector } = await import('../src/connectors/notion.js');
    connector = new NotionConnector();
  });

  it('has correct connector metadata', () => {
    expect(connector.name).toBe('notion');
    expect(connector.displayName).toBe('Notion');
    expect(connector.authMethods).toContain('api-key');
    expect(connector.supportsWriteBack).toBe(true);
  });

  it('throws ConnectorAuthError when not authenticated', async () => {
    await expect(connector.listSources()).rejects.toThrow('Not authenticated');
  });

  it('writeBack throws when not authenticated', async () => {
    await expect(
      connector.writeBack('notion:page:abc-123', 'corrected', 'typo fix'),
    ).rejects.toThrow('Not authenticated');
  });

  it('validate returns false when not authenticated', async () => {
    expect(await connector.validate()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NotionConnector.writeBack (with mocked client)
// ---------------------------------------------------------------------------

describe('NotionConnector.writeBack', () => {
  it('creates a comment and returns success', async () => {
    const createFn = vi.fn().mockResolvedValue({
      id: 'comment-1',
      parent: { page_id: 'abc-123' },
    });

    const mockClient: NotionClient = {
      search: vi.fn(),
      pages: { retrieve: vi.fn() },
      blocks: { children: { list: vi.fn() } },
      databases: { query: vi.fn() },
      comments: { create: createFn },
      users: { me: vi.fn().mockResolvedValue({ id: 'u1' }) },
    };

    const { NotionConnector } = await import('../src/connectors/notion.js');
    const conn = new NotionConnector();
    // Inject mock client via authenticate path workaround:
    // We access the private field directly for test isolation.
    (conn as unknown as { client: NotionClient }).client = mockClient;

    const result = await conn.writeBack(
      'notion:page:abc-123',
      'corrected content',
      '[contradiction] Rate limit is 1000/min here but 500/min in another doc',
    );

    expect(result.success).toBe(true);
    expect(result.updatedUrl).toContain('notion.so');
    expect(createFn).toHaveBeenCalledWith({
      parent: { page_id: 'abc-123' },
      rich_text: [{
        type: 'text',
        text: { content: 'Ody Refine: [contradiction] Rate limit is 1000/min here but 500/min in another doc' },
      }],
    });
  });

  it('returns failure when Notion API errors', async () => {
    const createFn = vi.fn().mockRejectedValue(
      new Error('Could not find page with ID: bad-id'),
    );

    const mockClient: NotionClient = {
      search: vi.fn(),
      pages: { retrieve: vi.fn() },
      blocks: { children: { list: vi.fn() } },
      databases: { query: vi.fn() },
      comments: { create: createFn },
      users: { me: vi.fn().mockResolvedValue({ id: 'u1' }) },
    };

    const { NotionConnector } = await import('../src/connectors/notion.js');
    const conn = new NotionConnector();
    (conn as unknown as { client: NotionClient }).client = mockClient;

    const result = await conn.writeBack(
      'notion:page:bad-id',
      'corrected',
      'fix typo',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not find page');
    expect(result.updatedUrl).toContain('notion.so');
  });
});
