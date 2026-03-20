/**
 * Slack API client for Ody Refine.
 * Wraps @slack/web-api (optional) or falls back to fetch-based calls.
 * Handles rate limiting (Tier 3: ~50 req/min).
 * @module connectors/slack-api
 */
import { ConnectorError } from './types.js';

/** Rate limit: 50 requests per minute for Tier 3 methods. */
const RATE_LIMIT_RPM = 50;

/** Minimum delay between requests in milliseconds. */
const MIN_DELAY_MS = Math.ceil(60_000 / RATE_LIMIT_RPM);

/** Slack API base URL. */
const SLACK_API_BASE = 'https://slack.com/api';

/** Slack channel info from conversations.list. */
export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members: number;
  topic?: { value: string };
  purpose?: { value: string };
}

/** Slack message from conversations.history / conversations.replies. */
export interface SlackMessage {
  ts: string;
  thread_ts?: string;
  text: string;
  user?: string;
  reply_count?: number;
  reactions?: Array<{ name: string; count: number }>;
  subtype?: string;
}

/** Slack user profile. */
export interface SlackUserProfile {
  id: string;
  real_name: string;
  display_name: string;
}

/** auth.test response shape. */
interface AuthTestResponse {
  ok: boolean;
  user_id?: string;
  team_id?: string;
  team?: string;
  error?: string;
}

/** Generic paginated Slack response. */
interface SlackListResponse<T> {
  ok: boolean;
  error?: string;
  response_metadata?: { next_cursor?: string };
  channels?: T[];
  messages?: T[];
  members?: T[];
}

/**
 * Low-level Slack API client with built-in rate limiting.
 * Uses @slack/web-api if available, otherwise raw fetch.
 */
export class SlackApiClient {
  private lastRequestAt = 0;
  private userCache = new Map<string, SlackUserProfile>();

  constructor(private readonly token: string) {}

  /** Test authentication and return team info. */
  async authTest(): Promise<AuthTestResponse> {
    return this.call<AuthTestResponse>('auth.test');
  }

  /** List channels the bot has access to. */
  async listChannels(): Promise<SlackChannel[]> {
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;
    let types = 'public_channel,private_channel';
    let needsRetry = false;

    do {
      needsRetry = false;
      const params: Record<string, string> = {
        types,
        exclude_archived: 'true',
        limit: '200',
      };
      if (cursor) params['cursor'] = cursor;

      const resp = await this.call<SlackListResponse<SlackChannel>>(
        'conversations.list', params,
      );
      if (!resp.ok) {
        if (resp.error === 'missing_scope' && types.includes('private_channel')) {
          // Token lacks groups:read — retry with public channels only
          types = 'public_channel';
          cursor = undefined;
          channels.length = 0;
          needsRetry = true;
          continue;
        }
        throw new ConnectorError('slack', 'listChannels', resp.error ?? 'Unknown error');
      }
      if (resp.channels) channels.push(...resp.channels);
      cursor = resp.response_metadata?.next_cursor || undefined;
    } while (cursor || needsRetry);

    return channels;
  }

  /** Fetch message history for a channel. */
  async fetchHistory(
    channelId: string,
    opts?: { oldest?: string; limit?: number },
  ): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, string> = {
        channel: channelId,
        limit: String(opts?.limit ?? 200),
      };
      if (opts?.oldest) params['oldest'] = opts.oldest;
      if (cursor) params['cursor'] = cursor;

      const resp = await this.call<SlackListResponse<SlackMessage>>(
        'conversations.history', params,
      );
      if (!resp.ok) {
        throw new ConnectorError('slack', 'fetchHistory', resp.error ?? 'Unknown error');
      }
      if (resp.messages) messages.push(...resp.messages);
      cursor = resp.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return messages;
  }

  /** Fetch all replies in a thread. */
  async fetchReplies(channelId: string, threadTs: string): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, string> = {
        channel: channelId,
        ts: threadTs,
        limit: '200',
      };
      if (cursor) params['cursor'] = cursor;

      const resp = await this.call<SlackListResponse<SlackMessage>>(
        'conversations.replies', params,
      );
      if (!resp.ok) {
        throw new ConnectorError('slack', 'fetchReplies', resp.error ?? 'Unknown error');
      }
      if (resp.messages) messages.push(...resp.messages);
      cursor = resp.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return messages;
  }

  /** Post a message (used for write-back). */
  async postMessage(
    channelId: string,
    text: string,
    threadTs?: string,
  ): Promise<{ ok: boolean; ts?: string; error?: string }> {
    const params: Record<string, string> = { channel: channelId, text };
    if (threadTs) params['thread_ts'] = threadTs;
    return this.call('chat.postMessage', params);
  }

  /** Resolve a user ID to a display name. */
  async resolveUser(userId: string): Promise<string> {
    const cached = this.userCache.get(userId);
    if (cached) return cached.display_name || cached.real_name;

    const resp = await this.call<{
      ok: boolean;
      user?: { real_name?: string; profile?: { display_name?: string } };
    }>('users.info', { user: userId });

    const name = resp.user?.profile?.display_name
      || resp.user?.real_name
      || userId;
    this.userCache.set(userId, {
      id: userId,
      real_name: resp.user?.real_name ?? userId,
      display_name: name,
    });
    return name;
  }

  /** Make a rate-limited Slack API call. */
  private async call<T>(method: string, params?: Record<string, string>): Promise<T> {
    await this.rateLimit();
    const url = new URL(`${SLACK_API_BASE}/${method}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    if (!resp.ok) {
      throw new ConnectorError('slack', method, `HTTP ${resp.status}`);
    }
    return resp.json() as Promise<T>;
  }

  /** Enforce rate limit by sleeping if needed. */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < MIN_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
    }
    this.lastRequestAt = Date.now();
  }
}

/**
 * Try to load @slack/web-api. Returns false if not installed.
 * This is checked at runtime so the dependency stays optional.
 */
export async function checkSlackSdkAvailable(): Promise<boolean> {
  try {
    // @ts-expect-error — optional dependency, may not be installed
    await import('@slack/web-api');
    return true;
  } catch {
    return false;
  }
}
