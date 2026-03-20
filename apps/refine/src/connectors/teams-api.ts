/**
 * Microsoft Graph API client for Teams integration in Ody Refine.
 * Fetch-based (no SDK). Handles rate limiting, pagination, delta queries.
 * @module connectors/teams-api
 */
import { ConnectorError } from './types.js';
import { teamsHtmlToText } from './teams-html.js';

export { teamsHtmlToText } from './teams-html.js';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const RATE_LIMIT_DELAY_MS = 200;
const MAX_PAGES = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Teams team from the Graph API. */
export interface TeamsTeam {
  id: string;
  displayName: string;
  description: string | null;
}

/** Teams channel from the Graph API. */
export interface TeamsChannel {
  id: string;
  displayName: string;
  description: string | null;
}

/** Teams message from the Graph API. */
export interface TeamsMessage {
  id: string;
  messageType: string;
  body: { content: string; contentType: string };
  from?: { user?: { displayName: string; id: string } };
  createdDateTime: string;
  webUrl?: string;
}

/** Result of a delta message query. */
export interface TeamsDeltaResult {
  messages: TeamsMessage[];
  nextDeltaLink?: string;
}

/** Graph API paginated response envelope. */
interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

class TeamsRateLimiter {
  private lastCallAt = 0;
  constructor(private readonly delayMs = RATE_LIMIT_DELAY_MS) {}

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallAt;
    if (elapsed < this.delayMs) {
      await new Promise<void>((r) => setTimeout(r, this.delayMs - elapsed));
    }
    this.lastCallAt = Date.now();
  }
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

/**
 * Low-level Microsoft Graph API client for Teams.
 * Bearer-token auth only (OAuth2 / app registration).
 */
export class TeamsApiClient {
  private readonly rateLimiter: TeamsRateLimiter;

  constructor(
    private readonly accessToken: string,
    rateLimiter?: TeamsRateLimiter,
  ) {
    this.rateLimiter = rateLimiter ?? new TeamsRateLimiter();
  }

  /** Validate token by fetching the current user profile. */
  async validateToken(): Promise<boolean> {
    try {
      await this.apiFetch<{ id: string }>('/me');
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch all joined teams. */
  async fetchTeams(): Promise<TeamsTeam[]> {
    const data = await this.apiFetch<GraphListResponse<TeamsTeam>>(
      '/me/joinedTeams',
    );
    return data.value.map((t) => ({
      id: t.id,
      displayName: t.displayName,
      description: t.description,
    }));
  }

  /** Fetch channels for a team. */
  async fetchChannels(teamId: string): Promise<TeamsChannel[]> {
    const data = await this.apiFetch<GraphListResponse<TeamsChannel>>(
      `/teams/${teamId}/channels`,
    );
    return data.value.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      description: c.description,
    }));
  }

  /** Fetch channel messages with delta support for incremental sync. */
  async fetchChannelMessages(
    teamId: string,
    channelId: string,
    deltaToken?: string,
  ): Promise<TeamsDeltaResult> {
    const messages: TeamsMessage[] = [];
    let nextUrl = deltaToken ??
      `${GRAPH_BASE_URL}/teams/${teamId}/channels/${channelId}/messages/delta`;
    let pageCount = 0;

    while (nextUrl && pageCount < MAX_PAGES) {
      const data = await this.apiFetch<GraphListResponse<TeamsMessage>>(nextUrl);

      for (const msg of data.value) {
        if (msg.messageType !== 'message') continue;
        if (!msg.body?.content) continue;
        messages.push({
          ...msg,
          body: {
            contentType: msg.body.contentType,
            content: msg.body.contentType === 'html'
              ? teamsHtmlToText(msg.body.content)
              : msg.body.content,
          },
        });
      }

      if (data['@odata.nextLink']) {
        nextUrl = data['@odata.nextLink'];
        pageCount++;
      } else {
        return { messages, nextDeltaLink: data['@odata.deltaLink'] };
      }
    }
    return { messages };
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /** Rate-limited, retried fetch against the Graph API. */
  private async apiFetch<T>(
    pathOrUrl: string,
    opts?: RequestInit,
  ): Promise<T> {
    const url = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `${GRAPH_BASE_URL}${pathOrUrl}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimiter.throttle();
      const response = await fetch(url, {
        ...opts,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...(opts?.headers as Record<string, string> | undefined),
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get('Retry-After') ?? '5', 10,
        );
        await new Promise<void>((r) => setTimeout(r, retryAfter * 1_000));
        continue;
      }
      if (!response.ok) {
        lastError = new ConnectorError(
          'teams', 'apiFetch',
          `HTTP ${response.status} ${response.statusText}`,
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
    throw lastError ?? new ConnectorError(
      'teams', 'apiFetch', 'Max retries exceeded',
    );
  }
}
