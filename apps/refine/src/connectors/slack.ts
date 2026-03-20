/**
 * Slack connector for Ody Refine.
 * Reads Slack channel messages/threads and normalizes to ConnectorDocument.
 * Write-back posts correction messages as thread replies.
 * @module connectors/slack
 */
import type {
  RefineConnector,
  ConnectorAuth,
  ConnectorSource,
  ConnectorDocument,
  ConnectorProgress,
  WriteBackResult,
  AuthMethod,
  SyncCursor,
  SyncChange,
} from './types.js';
import { ConnectorAuthError } from './types.js';
import { SlackApiClient } from './slack-api.js';
import {
  groupMessagesIntoThreads,
  threadToDocument,
  DEFAULT_MIN_THREAD_REPLIES,
} from './slack-threads.js';

/**
 * Slack connector — reads channel messages and threads, posts corrections.
 *
 * Auth method:
 * - bot-token: Bot user OAuth token (from api.slack.com/apps)
 *
 * Required scopes: channels:history, channels:read, chat:write, users:read
 *
 * Sources: public channels + joined private channels.
 * Documents: thread summaries (threads with 2+ replies, likely decisions).
 *   Individual messages are NOT documents — threads are the unit of knowledge.
 * Write-back: post correction as a thread reply (Slack messages are immutable).
 */
export class SlackConnector implements RefineConnector {
  readonly name = 'slack';
  readonly displayName = 'Slack';
  readonly authMethods: AuthMethod[] = ['bot-token', 'oauth'];
  readonly supportsWriteBack = true;

  private client: SlackApiClient | null = null;
  private minThreadReplies = DEFAULT_MIN_THREAD_REPLIES;
  private userNameCache = new Map<string, string>();

  /** @inheritdoc */
  async authenticate(auth: ConnectorAuth): Promise<void> {
    const token = auth.token || process.env['SLACK_BOT_TOKEN'];
    if (!token) {
      throw new ConnectorAuthError(
        'slack',
        'Token is required. Set SLACK_BOT_TOKEN or pass a token.',
      );
    }
    if (auth.params?.['minThreadReplies']) {
      this.minThreadReplies = parseInt(auth.params['minThreadReplies'], 10);
    }

    const client = new SlackApiClient(token);
    const result = await client.authTest();
    if (!result.ok) {
      throw new ConnectorAuthError(
        'slack',
        `Invalid token: ${result.error ?? 'unknown error'}`,
      );
    }
    this.client = client;
  }

  /** @inheritdoc */
  async listSources(): Promise<ConnectorSource[]> {
    const client = this.ensureClient();
    const channels = await client.listChannels();

    return channels
      .filter((ch) => ch.is_member)
      .map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.is_private ? 'private_channel' : 'public_channel',
        estimatedDocCount: ch.num_members,
      }));
  }

  /** @inheritdoc */
  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.ensureClient();
    let processed = 0;
    const total = sources.length;

    for (const source of sources) {
      onProgress?.({
        phase: 'fetch',
        current: processed,
        total,
        message: `Fetching #${source.name}...`,
      });

      const messages = await client.fetchHistory(source.id);
      const threads = groupMessagesIntoThreads(
        messages, source.id, source.name, this.minThreadReplies,
      );

      for (const thread of threads) {
        // Fetch full replies for threads (history only shows parent)
        if (thread.parentMessage.reply_count
            && thread.parentMessage.reply_count > 0
            && thread.replies.length === 0) {
          const replies = await client.fetchReplies(
            source.id, thread.parentMessage.ts,
          );
          // First message is the parent; rest are replies
          thread.replies = replies.filter(
            (m) => m.ts !== thread.parentMessage.ts,
          );
        }

        // Resolve user names
        await this.resolveThreadUsers(thread.parentMessage, thread.replies);

        const doc = threadToDocument(
          thread,
          (userId) => this.userNameCache.get(userId) ?? userId,
        );
        yield doc;
      }

      processed++;
      onProgress?.({
        phase: 'fetch',
        current: processed,
        total,
        message: `Done #${source.name} (${threads.length} threads)`,
      });
    }
  }

  /** @inheritdoc */
  getInitialCursor(): SyncCursor {
    return {
      type: 'timestamp',
      value: String(Date.now() / 1000),
      connectorName: 'slack',
      updatedAt: new Date().toISOString(),
    };
  }

  /** @inheritdoc */
  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    const client = this.ensureClient();
    const oldest = cursor ? cursor.value : undefined;
    const channels = await client.listChannels();

    for (const ch of channels) {
      const messages = await client.fetchHistory(
        ch.id, oldest ? { oldest } : undefined,
      );
      const threads = groupMessagesIntoThreads(
        messages, ch.id, ch.name, this.minThreadReplies,
      );

      for (const thread of threads) {
        if (thread.parentMessage.reply_count
            && thread.parentMessage.reply_count > 0
            && thread.replies.length === 0) {
          const replies = await client.fetchReplies(
            ch.id, thread.parentMessage.ts,
          );
          thread.replies = replies.filter(
            (m) => m.ts !== thread.parentMessage.ts,
          );
        }
        await this.resolveThreadUsers(thread.parentMessage, thread.replies);

        yield {
          document: threadToDocument(
            thread,
            (userId) => this.userNameCache.get(userId) ?? userId,
          ),
          action: 'upsert',
        };
      }
    }
  }

  /**
   * Write-back for Slack: post a correction as a thread reply.
   * Slack messages are immutable — we post a bot message explaining the correction.
   */
  async writeBack(
    documentId: string,
    correctedContent: string,
    reason: string,
  ): Promise<WriteBackResult> {
    const client = this.ensureClient();
    const parsed = parseDocumentId(documentId);
    if (!parsed) {
      return { documentId, success: false, error: 'Invalid document ID format' };
    }

    const text = [
      ':clipboard: *Ody Refine — Correction*',
      '',
      `*Reason:* ${reason}`,
      '',
      correctedContent,
    ].join('\n');

    const result = await client.postMessage(
      parsed.channelId, text, parsed.threadTs,
    );

    if (!result.ok) {
      return { documentId, success: false, error: result.error ?? 'Post failed' };
    }

    return {
      documentId,
      success: true,
      updatedUrl: `https://slack.com/archives/${parsed.channelId}/p${parsed.threadTs.replace('.', '')}`,
    };
  }

  /** @inheritdoc */
  async validate(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.authTest();
      return result.ok;
    } catch {
      return false;
    }
  }

  /** Resolve user IDs in messages to display names. */
  private async resolveThreadUsers(
    parent: { user?: string },
    replies: Array<{ user?: string }>,
  ): Promise<void> {
    const client = this.ensureClient();
    const allUsers = new Set<string>();
    if (parent.user) allUsers.add(parent.user);
    for (const r of replies) {
      if (r.user) allUsers.add(r.user);
    }
    for (const userId of allUsers) {
      if (!this.userNameCache.has(userId)) {
        try {
          const name = await client.resolveUser(userId);
          this.userNameCache.set(userId, name);
        } catch {
          this.userNameCache.set(userId, userId);
        }
      }
    }
  }

  /** Guard: throw if not authenticated, return client. */
  private ensureClient(): SlackApiClient {
    if (!this.client) {
      throw new ConnectorAuthError(
        'slack', 'Not authenticated. Call authenticate() first.',
      );
    }
    return this.client;
  }
}

/** Parse a slack document ID into channel + thread. */
function parseDocumentId(
  docId: string,
): { channelId: string; threadTs: string } | null {
  // Format: slack:thread:CHANNEL_ID:THREAD_TS
  const parts = docId.split(':');
  if (parts.length !== 4 || parts[0] !== 'slack' || parts[1] !== 'thread') {
    return null;
  }
  return { channelId: parts[2]!, threadTs: parts[3]! };
}
