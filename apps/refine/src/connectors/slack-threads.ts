/**
 * Thread-to-document converter for Slack connector.
 * Groups messages by thread_ts, formats threads as readable markdown.
 * @module connectors/slack-threads
 */
import type { ConnectorDocument } from './types.js';
import type { SlackMessage } from './slack-api.js';

/** Maximum messages to include in full detail before summarizing. */
const MAX_FULL_MESSAGES = 20;

/** Minimum replies for a thread to be considered worth ingesting. */
export const DEFAULT_MIN_THREAD_REPLIES = 2;

/** A grouped thread with its parent message and replies. */
export interface SlackThread {
  channelId: string;
  channelName: string;
  parentMessage: SlackMessage;
  replies: SlackMessage[];
}

/**
 * Group messages into threads.
 * Messages with thread_ts are grouped under their parent.
 * Top-level messages without replies are returned as single-message threads.
 */
export function groupMessagesIntoThreads(
  messages: SlackMessage[],
  channelId: string,
  channelName: string,
  minReplies: number,
): SlackThread[] {
  const threadMap = new Map<string, SlackMessage[]>();
  const parentMap = new Map<string, SlackMessage>();

  // First pass: index all messages
  for (const msg of messages) {
    if (msg.subtype === 'channel_join' || msg.subtype === 'channel_leave') {
      continue;
    }
    const threadKey = msg.thread_ts ?? msg.ts;
    if (!threadMap.has(threadKey)) {
      threadMap.set(threadKey, []);
    }
    threadMap.get(threadKey)!.push(msg);

    // Track parent messages (the one where ts === thread_ts or has no thread_ts)
    if (!msg.thread_ts || msg.ts === msg.thread_ts) {
      parentMap.set(threadKey, msg);
    }
  }

  // Second pass: build thread objects, filter by reply count
  const threads: SlackThread[] = [];
  for (const [threadTs, msgs] of threadMap) {
    const parent = parentMap.get(threadTs) ?? msgs[0]!;
    const replies = msgs.filter((m) => m.ts !== parent.ts);

    if (replies.length < minReplies) continue;

    threads.push({
      channelId,
      channelName,
      parentMessage: parent,
      replies: replies.sort(
        (a, b) => parseFloat(a.ts) - parseFloat(b.ts),
      ),
    });
  }

  return threads.sort(
    (a, b) => parseFloat(b.parentMessage.ts) - parseFloat(a.parentMessage.ts),
  );
}

/**
 * Convert a Slack thread into a ConnectorDocument.
 * Formats the thread as readable markdown with participants and timestamps.
 */
export function threadToDocument(
  thread: SlackThread,
  userResolver?: (userId: string) => string,
): ConnectorDocument {
  const resolve = userResolver ?? ((id: string) => id);
  const allMessages = [thread.parentMessage, ...thread.replies];
  const participants = new Set<string>();
  for (const msg of allMessages) {
    if (msg.user) participants.add(msg.user);
  }

  const title = buildThreadTitle(thread, resolve);
  const content = formatThreadContent(thread, resolve);
  const threadTs = thread.parentMessage.ts;
  const lastMsg = thread.replies[thread.replies.length - 1] ?? thread.parentMessage;

  return {
    id: `slack:thread:${thread.channelId}:${threadTs}`,
    title,
    content,
    sourceType: 'slack',
    sourceUrl: buildSlackUrl(thread.channelId, threadTs),
    lastModified: tsToDate(lastMsg.ts),
    author: thread.parentMessage.user
      ? resolve(thread.parentMessage.user)
      : undefined,
    metadata: {
      channelId: thread.channelId,
      channelName: thread.channelName,
      threadTs,
      participantCount: participants.size,
      replyCount: thread.replies.length,
      participants: [...participants].map(resolve),
      parentChain: [
        { type: 'workspace', name: 'Slack Workspace' },
        { type: 'channel', name: `#${thread.channelName}`, id: thread.channelId },
        { type: 'thread', name: title, id: threadTs },
      ],
      analysisHints: {
        factDensity: 'low' as const,
        authoritative: false,
      },
    },
  };
}

/** Build a thread title from the first message. */
function buildThreadTitle(
  thread: SlackThread,
  resolve: (id: string) => string,
): string {
  const firstLine = thread.parentMessage.text.split('\n')[0] ?? '';
  const truncated = firstLine.length > 80
    ? firstLine.slice(0, 77) + '...'
    : firstLine;
  const author = thread.parentMessage.user
    ? resolve(thread.parentMessage.user)
    : 'Unknown';
  return `#${thread.channelName} — ${author}: ${truncated}`;
}

/** Format thread content as readable markdown. */
function formatThreadContent(
  thread: SlackThread,
  resolve: (id: string) => string,
): string {
  const allMessages = [thread.parentMessage, ...thread.replies];
  const parts: string[] = [];

  parts.push(`# Thread in #${thread.channelName}`);
  parts.push('');
  parts.push(`**Started:** ${formatTimestamp(thread.parentMessage.ts)}`);
  parts.push(`**Participants:** ${countParticipants(allMessages, resolve)}`);
  parts.push(`**Replies:** ${thread.replies.length}`);
  parts.push('');
  parts.push('---');
  parts.push('');

  if (allMessages.length <= MAX_FULL_MESSAGES) {
    // Full detail for short threads
    for (const msg of allMessages) {
      parts.push(formatMessage(msg, resolve));
      parts.push('');
    }
  } else {
    // Summarized for long threads
    parts.push(formatSummarizedThread(allMessages, resolve));
  }

  // Reactions summary
  const reactions = collectReactions(allMessages);
  if (reactions.length > 0) {
    parts.push('---');
    parts.push('');
    parts.push('**Key reactions:** ' + reactions.join(', '));
  }

  return parts.join('\n');
}

/** Format a single message as markdown. */
function formatMessage(
  msg: SlackMessage,
  resolve: (id: string) => string,
): string {
  const author = msg.user ? resolve(msg.user) : 'Unknown';
  const time = formatTimestamp(msg.ts);
  const reactionStr = msg.reactions
    ? ' ' + msg.reactions.map((r) => `:${r.name}: (${r.count})`).join(' ')
    : '';
  return `**${author}** (${time})${reactionStr}\n> ${msg.text.replace(/\n/g, '\n> ')}`;
}

/** Summarize a long thread: first 5, last 5, key reactions in between. */
function formatSummarizedThread(
  messages: SlackMessage[],
  resolve: (id: string) => string,
): string {
  const parts: string[] = [];
  const first5 = messages.slice(0, 5);
  const last5 = messages.slice(-5);
  const skipped = messages.length - 10;

  for (const msg of first5) {
    parts.push(formatMessage(msg, resolve));
    parts.push('');
  }

  parts.push(`*... ${skipped} messages omitted ...*`);
  parts.push('');

  // Include any heavily-reacted messages from the middle
  const middle = messages.slice(5, -5);
  const reacted = middle
    .filter((m) => m.reactions && m.reactions.some((r) => r.count >= 3))
    .slice(0, 3);
  if (reacted.length > 0) {
    parts.push('**Key messages (by reactions):**');
    parts.push('');
    for (const msg of reacted) {
      parts.push(formatMessage(msg, resolve));
      parts.push('');
    }
  }

  for (const msg of last5) {
    parts.push(formatMessage(msg, resolve));
    parts.push('');
  }

  return parts.join('\n');
}

/** Count unique participants and format as string. */
function countParticipants(
  messages: SlackMessage[],
  resolve: (id: string) => string,
): string {
  const users = new Set<string>();
  for (const msg of messages) {
    if (msg.user) users.add(msg.user);
  }
  return [...users].map(resolve).join(', ');
}

/** Collect reactions across all messages. */
function collectReactions(messages: SlackMessage[]): string[] {
  const reactionCounts = new Map<string, number>();
  for (const msg of messages) {
    if (!msg.reactions) continue;
    for (const r of msg.reactions) {
      const prev = reactionCounts.get(r.name) ?? 0;
      reactionCounts.set(r.name, prev + r.count);
    }
  }
  return [...reactionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `:${name}: (${count})`);
}

/** Convert Slack timestamp to Date. */
function tsToDate(ts: string): Date {
  return new Date(parseFloat(ts) * 1000);
}

/** Format a Slack timestamp as human-readable string. */
function formatTimestamp(ts: string): string {
  return tsToDate(ts).toISOString().replace('T', ' ').slice(0, 19);
}

/** Build a Slack deep link URL for a thread. */
function buildSlackUrl(channelId: string, threadTs: string): string {
  const tsForUrl = threadTs.replace('.', '');
  return `https://slack.com/archives/${channelId}/p${tsForUrl}`;
}
