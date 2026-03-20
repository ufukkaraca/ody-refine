/**
 * Tests for the Slack connector: thread grouping, thread-to-doc, write-back.
 * Mocks the Slack SDK — does not require actual API access.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlackMessage } from '../src/connectors/slack-api.js';
import {
  groupMessagesIntoThreads,
  threadToDocument,
  DEFAULT_MIN_THREAD_REPLIES,
} from '../src/connectors/slack-threads.js';
import type { SlackThread } from '../src/connectors/slack-threads.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Create a minimal Slack message. */
function msg(
  ts: string,
  text: string,
  opts?: { thread_ts?: string; user?: string; reply_count?: number; subtype?: string;
    reactions?: Array<{ name: string; count: number }> },
): SlackMessage {
  return {
    ts,
    text,
    user: opts?.user ?? 'U001',
    thread_ts: opts?.thread_ts,
    reply_count: opts?.reply_count,
    subtype: opts?.subtype,
    reactions: opts?.reactions,
  };
}

/** Simple user resolver for tests. */
const resolveUser = (id: string): string => {
  const names: Record<string, string> = {
    U001: 'Alice',
    U002: 'Bob',
    U003: 'Charlie',
  };
  return names[id] ?? id;
};

// ---------------------------------------------------------------------------
// groupMessagesIntoThreads
// ---------------------------------------------------------------------------

describe('groupMessagesIntoThreads', () => {
  it('groups replies under their parent by thread_ts', () => {
    const messages: SlackMessage[] = [
      msg('1000.0', 'Parent message', { user: 'U001' }),
      msg('1001.0', 'Reply 1', { thread_ts: '1000.0', user: 'U002' }),
      msg('1002.0', 'Reply 2', { thread_ts: '1000.0', user: 'U003' }),
    ];
    const threads = groupMessagesIntoThreads(messages, 'C01', 'general', 2);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.parentMessage.ts).toBe('1000.0');
    expect(threads[0]!.replies).toHaveLength(2);
  });

  it('filters out threads with fewer replies than minReplies', () => {
    const messages: SlackMessage[] = [
      msg('1000.0', 'Only parent'),
      msg('1001.0', 'Single reply', { thread_ts: '1000.0' }),
    ];
    // minReplies = 2 means we need 2 replies (excluding parent)
    const threads = groupMessagesIntoThreads(messages, 'C01', 'general', 2);
    expect(threads).toHaveLength(0);
  });

  it('includes threads meeting the minimum reply threshold', () => {
    const messages: SlackMessage[] = [
      msg('1000.0', 'Parent'),
      msg('1001.0', 'Reply 1', { thread_ts: '1000.0' }),
      msg('1002.0', 'Reply 2', { thread_ts: '1000.0' }),
    ];
    const threads = groupMessagesIntoThreads(messages, 'C01', 'general', 2);
    expect(threads).toHaveLength(1);
  });

  it('skips channel_join and channel_leave messages', () => {
    const messages: SlackMessage[] = [
      msg('1000.0', 'Parent'),
      msg('1001.0', 'joined', { thread_ts: '1000.0', subtype: 'channel_join' }),
      msg('1002.0', 'Reply 1', { thread_ts: '1000.0' }),
      msg('1003.0', 'Reply 2', { thread_ts: '1000.0' }),
    ];
    const threads = groupMessagesIntoThreads(messages, 'C01', 'general', 2);
    expect(threads).toHaveLength(1);
    // The join message should not be included
    expect(threads[0]!.replies).toHaveLength(2);
  });

  it('sorts replies by timestamp ascending', () => {
    const messages: SlackMessage[] = [
      msg('1000.0', 'Parent'),
      msg('1003.0', 'Reply 3', { thread_ts: '1000.0' }),
      msg('1001.0', 'Reply 1', { thread_ts: '1000.0' }),
      msg('1002.0', 'Reply 2', { thread_ts: '1000.0' }),
    ];
    const threads = groupMessagesIntoThreads(messages, 'C01', 'general', 2);
    expect(threads[0]!.replies[0]!.ts).toBe('1001.0');
    expect(threads[0]!.replies[1]!.ts).toBe('1002.0');
    expect(threads[0]!.replies[2]!.ts).toBe('1003.0');
  });

  it('sorts threads by parent timestamp descending (newest first)', () => {
    const messages: SlackMessage[] = [
      msg('1000.0', 'Old thread'),
      msg('1001.0', 'R1', { thread_ts: '1000.0' }),
      msg('1002.0', 'R2', { thread_ts: '1000.0' }),
      msg('2000.0', 'New thread'),
      msg('2001.0', 'R1', { thread_ts: '2000.0' }),
      msg('2002.0', 'R2', { thread_ts: '2000.0' }),
    ];
    const threads = groupMessagesIntoThreads(messages, 'C01', 'general', 2);
    expect(threads).toHaveLength(2);
    expect(threads[0]!.parentMessage.ts).toBe('2000.0');
    expect(threads[1]!.parentMessage.ts).toBe('1000.0');
  });

  it('handles messages where parent is identified by ts === thread_ts', () => {
    const messages: SlackMessage[] = [
      msg('1000.0', 'Parent', { thread_ts: '1000.0' }),
      msg('1001.0', 'Reply 1', { thread_ts: '1000.0' }),
      msg('1002.0', 'Reply 2', { thread_ts: '1000.0' }),
    ];
    const threads = groupMessagesIntoThreads(messages, 'C01', 'general', 2);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.parentMessage.text).toBe('Parent');
    expect(threads[0]!.replies).toHaveLength(2);
  });

  it('DEFAULT_MIN_THREAD_REPLIES is 2', () => {
    expect(DEFAULT_MIN_THREAD_REPLIES).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// threadToDocument
// ---------------------------------------------------------------------------

describe('threadToDocument', () => {
  const baseThread: SlackThread = {
    channelId: 'C01',
    channelName: 'engineering',
    parentMessage: msg('1700000000.000', 'Should we migrate to Postgres?', { user: 'U001' }),
    replies: [
      msg('1700000100.000', 'Yes, performance is better', { user: 'U002', thread_ts: '1700000000.000' }),
      msg('1700000200.000', 'Agreed, lets do it next sprint', { user: 'U003', thread_ts: '1700000000.000' }),
    ],
  };

  it('produces a ConnectorDocument with correct id format', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    expect(doc.id).toBe('slack:thread:C01:1700000000.000');
  });

  it('sets sourceType to slack', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    expect(doc.sourceType).toBe('slack');
  });

  it('includes channel name in the title', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    expect(doc.title).toContain('#engineering');
  });

  it('resolves user names in the title', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    expect(doc.title).toContain('Alice');
  });

  it('truncates long parent messages in the title', () => {
    const longThread: SlackThread = {
      ...baseThread,
      parentMessage: msg(
        '1700000000.000',
        'A'.repeat(100),
        { user: 'U001' },
      ),
    };
    const doc = threadToDocument(longThread, resolveUser);
    expect(doc.title.length).toBeLessThan(120);
    expect(doc.title).toContain('...');
  });

  it('formats content as readable markdown', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    expect(doc.content).toContain('# Thread in #engineering');
    expect(doc.content).toContain('**Participants:**');
    expect(doc.content).toContain('**Replies:** 2');
    expect(doc.content).toContain('migrate to Postgres');
    expect(doc.content).toContain('performance is better');
  });

  it('includes metadata with thread details', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    expect(doc.metadata['channelId']).toBe('C01');
    expect(doc.metadata['channelName']).toBe('engineering');
    expect(doc.metadata['threadTs']).toBe('1700000000.000');
    expect(doc.metadata['replyCount']).toBe(2);
    expect(doc.metadata['participantCount']).toBe(3);
  });

  it('generates a valid Slack URL', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    expect(doc.sourceUrl).toContain('slack.com/archives/C01/p');
  });

  it('sets lastModified from the last reply timestamp', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    // Last reply ts = 1700000200.000 → Date
    expect(doc.lastModified).toBeInstanceOf(Date);
    const expected = new Date(1700000200 * 1000);
    expect(doc.lastModified!.getTime()).toBe(expected.getTime());
  });

  it('sets author from parent message user', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    expect(doc.author).toBe('Alice');
  });

  it('uses userId as fallback when no resolver provided', () => {
    const doc = threadToDocument(baseThread);
    expect(doc.author).toBe('U001');
  });

  it('resolves participant names in metadata', () => {
    const doc = threadToDocument(baseThread, resolveUser);
    const participants = doc.metadata['participants'] as string[];
    expect(participants).toContain('Alice');
    expect(participants).toContain('Bob');
    expect(participants).toContain('Charlie');
  });
});

// ---------------------------------------------------------------------------
// threadToDocument — summarized long threads
// ---------------------------------------------------------------------------

describe('threadToDocument with >20 messages', () => {
  it('summarizes long threads (first 5, last 5, omission notice)', () => {
    const replies: SlackMessage[] = [];
    for (let i = 1; i <= 25; i++) {
      replies.push(
        msg(`${1700000000 + i * 100}.000`, `Reply number ${i}`, {
          user: i % 2 === 0 ? 'U002' : 'U003',
          thread_ts: '1700000000.000',
        }),
      );
    }

    const longThread: SlackThread = {
      channelId: 'C01',
      channelName: 'general',
      parentMessage: msg('1700000000.000', 'Starting a long discussion', { user: 'U001' }),
      replies,
    };

    const doc = threadToDocument(longThread, resolveUser);
    // The content should mention omitted messages
    expect(doc.content).toContain('messages omitted');
    // Should still contain the first few messages
    expect(doc.content).toContain('Reply number 1');
    // Should still contain the last few messages
    expect(doc.content).toContain('Reply number 25');
  });

  it('includes heavily-reacted messages from the middle', () => {
    const replies: SlackMessage[] = [];
    for (let i = 1; i <= 25; i++) {
      const opts: Parameters<typeof msg>[2] = {
        user: 'U002',
        thread_ts: '1700000000.000',
      };
      // Message #12 has lots of reactions
      if (i === 12) {
        opts.reactions = [{ name: 'fire', count: 5 }];
      }
      replies.push(msg(`${1700000000 + i * 100}.000`, `Reply ${i}`, opts));
    }

    const longThread: SlackThread = {
      channelId: 'C01',
      channelName: 'general',
      parentMessage: msg('1700000000.000', 'Discussion', { user: 'U001' }),
      replies,
    };

    const doc = threadToDocument(longThread, resolveUser);
    expect(doc.content).toContain('Key messages');
    expect(doc.content).toContain('Reply 12');
  });
});

// ---------------------------------------------------------------------------
// threadToDocument — reactions
// ---------------------------------------------------------------------------

describe('threadToDocument reactions', () => {
  it('includes reaction summary when messages have reactions', () => {
    const thread: SlackThread = {
      channelId: 'C01',
      channelName: 'general',
      parentMessage: msg('1700000000.000', 'Proposal', {
        user: 'U001',
        reactions: [{ name: 'thumbsup', count: 3 }],
      }),
      replies: [
        msg('1700000100.000', 'LGTM', {
          user: 'U002',
          thread_ts: '1700000000.000',
          reactions: [{ name: 'white_check_mark', count: 2 }],
        }),
        msg('1700000200.000', 'Ship it', {
          user: 'U003',
          thread_ts: '1700000000.000',
        }),
      ],
    };

    const doc = threadToDocument(thread, resolveUser);
    expect(doc.content).toContain('Key reactions');
    expect(doc.content).toContain(':thumbsup:');
  });
});

// ---------------------------------------------------------------------------
// SlackConnector
// ---------------------------------------------------------------------------

describe('SlackConnector', () => {
  let connector: InstanceType<typeof import('../src/connectors/slack.js').SlackConnector>;

  beforeEach(async () => {
    const { SlackConnector } = await import('../src/connectors/slack.js');
    connector = new SlackConnector();
  });

  it('has correct connector metadata', () => {
    expect(connector.name).toBe('slack');
    expect(connector.displayName).toBe('Slack');
    expect(connector.authMethods).toContain('bot-token');
    expect(connector.supportsWriteBack).toBe(true);
  });

  it('throws ConnectorAuthError when not authenticated', async () => {
    await expect(connector.listSources()).rejects.toThrow('Not authenticated');
  });

  it('validate returns false when not authenticated', async () => {
    expect(await connector.validate()).toBe(false);
  });

  it('writeBack returns error for invalid document ID', async () => {
    // Need to authenticate first — mock fetch for auth
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, user_id: 'U001', team_id: 'T01', team: 'Test' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'bot-token', token: 'xoxb-test' });

    // Now test writeBack with invalid ID
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: false, error: 'invalid_id' }),
    });

    const result = await connector.writeBack(
      'bad-id-format',
      'corrected text',
      'typo fix',
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid document ID');

    vi.unstubAllGlobals();
  });

  it('writeBack formats reply correctly for valid document ID', async () => {
    const mockFetch = vi.fn()
      // auth call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, user_id: 'U001', team_id: 'T01', team: 'Test' }),
      })
      // postMessage call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: '1700000300.000' }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'bot-token', token: 'xoxb-test' });

    const result = await connector.writeBack(
      'slack:thread:C01:1700000000.000',
      'The correct version is X',
      'outdated information',
    );
    expect(result.success).toBe(true);
    expect(result.updatedUrl).toContain('slack.com/archives/C01');

    // Verify the posted message includes the correction format
    const postCall = mockFetch.mock.calls[1];
    const postUrl = postCall![0] as string;
    expect(postUrl).toContain('chat.postMessage');
    expect(postUrl).toContain('channel=C01');
    expect(postUrl).toContain('thread_ts=1700000000.000');

    vi.unstubAllGlobals();
  });

  it('listSources returns channels from API', async () => {
    const mockFetch = vi.fn()
      // auth call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, user_id: 'U001', team_id: 'T01' }),
      })
      // listChannels call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C01', name: 'general', is_private: false, num_members: 50, is_member: true },
            { id: 'C02', name: 'engineering', is_private: true, num_members: 12, is_member: true },
          ],
          response_metadata: { next_cursor: '' },
        }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'bot-token', token: 'xoxb-test' });
    const sources = await connector.listSources();

    expect(sources).toHaveLength(2);
    expect(sources[0]!.name).toBe('general');
    expect(sources[0]!.type).toBe('public_channel');
    expect(sources[1]!.name).toBe('engineering');
    expect(sources[1]!.type).toBe('private_channel');

    vi.unstubAllGlobals();
  });

  it('fetchDocuments produces ConnectorDocument format', async () => {
    const mockFetch = vi.fn()
      // auth call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, user_id: 'U001', team_id: 'T01' }),
      })
      // fetchHistory call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          messages: [
            { ts: '1700000000.000', text: 'Should we use TypeScript?', user: 'U001', reply_count: 0 },
            { ts: '1700000100.000', text: 'Yes definitely', user: 'U002', thread_ts: '1700000000.000' },
            { ts: '1700000200.000', text: 'Agreed', user: 'U003', thread_ts: '1700000000.000' },
          ],
          response_metadata: { next_cursor: '' },
        }),
      })
      // resolveUser U001
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          user: { real_name: 'Alice', profile: { display_name: 'Alice' } },
        }),
      })
      // resolveUser U002
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          user: { real_name: 'Bob', profile: { display_name: 'Bob' } },
        }),
      })
      // resolveUser U003
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          user: { real_name: 'Charlie', profile: { display_name: 'Charlie' } },
        }),
      });
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'bot-token', token: 'xoxb-test' });

    const sources = [{ id: 'C01', name: 'general', type: 'public_channel' }];
    const docs: import('../src/connectors/types.js').ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments(sources)) {
      docs.push(doc);
    }

    expect(docs).toHaveLength(1);
    expect(docs[0]!.id).toMatch(/^slack:thread:/);
    expect(docs[0]!.sourceType).toBe('slack');
    expect(docs[0]!.content).toContain('TypeScript');
    expect(docs[0]!.title).toContain('#general');

    vi.unstubAllGlobals();
  });
});
