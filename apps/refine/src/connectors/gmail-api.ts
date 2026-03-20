/** Gmail API v1 client with rate limiting, retry, pagination, token refresh. */
import { ConnectorError } from './types.js';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MAX_PAGES = 10;
const PAGE_SIZE = 100;
const BATCH_SIZE = 20;
const RATE_LIMIT_DELAY_MS = 100;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;

/** Gmail message from the API (metadata format). */
export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
}

/** Normalized Gmail message summary for connector consumption. */
export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  from?: string;
  to?: string[];
  date?: string;
}

/** Gmail user profile. */
export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

/** Gmail label (folder/category). */
export interface GmailLabel {
  id: string;
  name: string;
  type: string;
  messagesTotal?: number;
}

/** Config for automatic OAuth token refresh on 401. */
export interface GmailRefreshConfig {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

class GmailRateLimiter {
  private lastCallAt = 0;
  constructor(private readonly delayMs = RATE_LIMIT_DELAY_MS) {}
  async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < this.delayMs) {
      await new Promise<void>((r) => setTimeout(r, this.delayMs - elapsed));
    }
    this.lastCallAt = Date.now();
  }
}

const getHeader = (msg: GmailMessage, name: string): string | undefined =>
  msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

/** Map a raw Gmail API message to a normalized summary. */
export function mapGmailMessage(msg: GmailMessage): GmailMessageSummary {
  const toHeader = getHeader(msg, 'To');
  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: getHeader(msg, 'Subject') ?? 'Email',
    snippet: msg.snippet ?? '',
    from: getHeader(msg, 'From'),
    to: toHeader ? toHeader.split(',').map((s) => s.trim()) : undefined,
    date: msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : undefined,
  };
}

/**
 * Low-level Gmail API client with rate limiting, retry, and pagination.
 * Bearer-token auth only (Google OAuth2).
 */
export class GmailApiClient {
  private accessToken: string;
  private readonly rateLimiter = new GmailRateLimiter();

  constructor(
    accessToken: string,
    private readonly refreshConfig?: GmailRefreshConfig,
  ) {
    this.accessToken = accessToken;
  }

  /** Validate token by fetching user profile. */
  async validateToken(): Promise<boolean> {
    try { await this.fetchProfile(); return true; }
    catch { return false; }
  }

  /** Fetch Gmail user profile. */
  async fetchProfile(): Promise<GmailProfile> {
    return this.apiFetch<GmailProfile>('/profile');
  }

  /** Fetch Gmail labels (used as browsable sources). */
  async fetchLabels(): Promise<GmailLabel[]> {
    const data = await this.apiFetch<{ labels: GmailLabel[] }>('/labels');
    return (data.labels ?? []).filter((l) => l.type === 'user' || l.type === 'system');
  }

  /** List messages matching a query, with pagination. */
  async listMessages(query?: string): Promise<GmailMessageSummary[]> {
    const ids = await this.fetchMessageIds(query);
    return this.fetchDetailsBatched(ids);
  }

  /** Fetch messages added since a history ID. */
  async listMessagesSinceHistory(startHistoryId: string): Promise<GmailMessageSummary[]> {
    const ids = await this.fetchHistoryIds(startHistoryId);
    return this.fetchDetailsBatched(ids);
  }

  private async fetchMessageIds(query?: string): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${GMAIL_BASE}/messages`);
      url.searchParams.set('maxResults', String(PAGE_SIZE));
      if (query) url.searchParams.set('q', query);
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await this.apiFetch<{
        messages?: Array<{ id: string }>; nextPageToken?: string;
      }>(url.toString());
      for (const msg of data.messages ?? []) ids.push(msg.id);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return ids;
  }

  private async fetchHistoryIds(startHistoryId: string): Promise<string[]> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${GMAIL_BASE}/history`);
      url.searchParams.set('startHistoryId', startHistoryId);
      url.searchParams.set('historyTypes', 'messageAdded');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await this.apiFetch<{
        history?: Array<{ messagesAdded?: Array<{ message?: { id: string } }> }>;
        nextPageToken?: string;
      }>(url.toString());
      for (const item of data.history ?? []) {
        for (const added of item.messagesAdded ?? []) {
          if (added.message?.id) ids.add(added.message.id);
        }
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return [...ids];
  }

  private async fetchDetailsBatched(ids: string[]): Promise<GmailMessageSummary[]> {
    const results: GmailMessageSummary[] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const details = await Promise.all(
        ids.slice(i, i + BATCH_SIZE).map((id) => this.fetchMessageDetail(id)),
      );
      results.push(...details.map(mapGmailMessage));
    }
    return results;
  }

  private async fetchMessageDetail(id: string): Promise<GmailMessage> {
    return this.apiFetch<GmailMessage>(
      `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To`,
    );
  }

  /** Rate-limited, retried fetch with 429/Retry-After and exponential backoff. */
  private async apiFetch<T>(pathOrUrl: string): Promise<T> {
    const url = pathOrUrl.startsWith('http')
      ? pathOrUrl : `${GMAIL_BASE}${pathOrUrl}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimiter.throttle();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (response.status === 401) {
        if (attempt === 0 && this.refreshConfig && await this.refreshAccessToken()) continue;
        throw new ConnectorError('gmail', 'apiFetch', `HTTP 401 ${response.statusText}`);
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
        await new Promise<void>((r) => setTimeout(r, retryAfter * 1_000));
        continue;
      }

      if (!response.ok) {
        lastError = new ConnectorError(
          'gmail', 'apiFetch', `HTTP ${response.status} ${response.statusText}`,
        );
        if (attempt < MAX_RETRIES - 1) {
          await new Promise<void>((r) =>
            setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)),
          );
          continue;
        }
        throw lastError;
      }
      return (await response.json()) as T;
    }
    throw lastError ?? new ConnectorError('gmail', 'apiFetch', 'Max retries exceeded');
  }

  /** Refresh the OAuth access token using the refresh token. */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshConfig) return false;
    const { refreshToken, clientId, clientSecret } = this.refreshConfig;
    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token', refresh_token: refreshToken,
          client_id: clientId, client_secret: clientSecret,
        }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { access_token?: string };
      if (!data.access_token) return false;
      this.accessToken = data.access_token;
      return true;
    } catch { return false; }
  }
}
