/**
 * Jira Cloud REST API v3 client for Ody Refine.
 * Fetch-based (no SDK). Handles rate limiting, pagination, retries.
 * Base URL: https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3
 * @module connectors/jira-api
 */
import { ConnectorError } from './types.js';
import { adfToPlainText } from './jira-adf.js';
import type { AdfNode } from './jira-adf.js';

export { adfToPlainText } from './jira-adf.js';
export type { AdfNode } from './jira-adf.js';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const RATE_LIMIT_DELAY_MS = 200;
const MAX_ISSUES_PER_SYNC = 2_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Jira project from the REST API. */
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
}

/** Jira issue from the REST API. */
export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: { name: string };
    assignee?: { displayName: string } | null;
    labels: string[];
    description: AdfNode | null;
    comment?: {
      comments: Array<{
        body: AdfNode | null;
        author?: { displayName: string };
      }>;
    };
    updated: string;
  };
}

/** Jira search response envelope. */
interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  startAt: number;
  maxResults: number;
}

/** Auth mode for the Jira API client. */
export type JiraAuthMode =
  | { type: 'basic'; email: string; apiToken: string }
  | { type: 'oauth'; accessToken: string };

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

/** Simple rate limiter: minimum delay between API calls. */
class JiraRateLimiter {
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
 * Low-level Jira Cloud API client.
 * Supports Basic auth (email+token) and OAuth (bearer).
 */
export class JiraApiClient {
  private readonly rateLimiter: JiraRateLimiter;

  constructor(
    private readonly baseUrl: string,
    private readonly auth: JiraAuthMode,
    rateLimiter?: JiraRateLimiter,
  ) {
    this.rateLimiter = rateLimiter ?? new JiraRateLimiter();
  }

  /** Validate credentials by fetching the current user. */
  async validateCredentials(): Promise<boolean> {
    try {
      await this.apiFetch<{ accountId: string }>('/rest/api/3/myself');
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch all projects (up to 200). */
  async fetchProjects(): Promise<JiraProject[]> {
    return this.apiFetch<JiraProject[]>(
      '/rest/api/3/project?expand=description',
    );
  }

  /** Fetch issues via JQL, optionally filtered by project and date. */
  async fetchIssues(
    projectKeys?: string[],
    updatedSince?: string,
  ): Promise<JiraIssue[]> {
    const allIssues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = 50;
    const jql = this.buildJql(projectKeys, updatedSince);
    const fields = 'summary,status,assignee,labels,description,comment,updated';
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        jql, fields,
        startAt: String(startAt),
        maxResults: String(maxResults),
      });
      const data = await this.apiFetch<JiraSearchResponse>(
        `/rest/api/3/search?${params.toString()}`,
      );
      allIssues.push(...data.issues);
      startAt += data.maxResults;
      hasMore = startAt < data.total;
      if (allIssues.length >= MAX_ISSUES_PER_SYNC) break;
    }
    return allIssues;
  }

  /**
   * Extract plain-text description and comments from a Jira issue.
   */
  extractIssueText(issue: JiraIssue): {
    description: string;
    comments: string[];
    issueUrl: string;
  } {
    const description = adfToPlainText(issue.fields.description);
    const comments = (issue.fields.comment?.comments ?? []).map((c) => {
      const prefix = c.author?.displayName ? `${c.author.displayName}: ` : '';
      return `${prefix}${adfToPlainText(c.body)}`;
    });
    const issueUrl = issue.self
      ? issue.self.replace(/\/rest\/api\/3\/issue\/.*/, `/browse/${issue.key}`)
      : `https://jira.atlassian.com/browse/${issue.key}`;
    return { description, comments, issueUrl };
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /** Rate-limited, retried fetch. */
  private async apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimiter.throttle();
      const response = await fetch(url, {
        ...opts,
        headers: {
          ...this.authHeaders(),
          Accept: 'application/json',
          ...(opts?.headers as Record<string, string> | undefined),
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
        await new Promise<void>((r) => setTimeout(r, retryAfter * 1_000));
        continue;
      }
      if (!response.ok) {
        lastError = new ConnectorError(
          'jira', 'apiFetch', `HTTP ${response.status} ${response.statusText}`,
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
    throw lastError ?? new ConnectorError('jira', 'apiFetch', 'Max retries exceeded');
  }

  /** Build Authorization header based on auth mode. */
  private authHeaders(): Record<string, string> {
    if (this.auth.type === 'basic') {
      const encoded = btoa(`${this.auth.email}:${this.auth.apiToken}`);
      return { Authorization: `Basic ${encoded}` };
    }
    return { Authorization: `Bearer ${this.auth.accessToken}` };
  }

  /** Build JQL query string. */
  private buildJql(projectKeys?: string[], updatedSince?: string): string {
    const parts: string[] = [];
    if (projectKeys?.length) {
      parts.push(`project in (${projectKeys.join(',')})`);
    }
    if (updatedSince) {
      const d = new Date(updatedSince);
      const fmt = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      parts.push(`updated >= "${fmt}"`);
    }
    parts.push('ORDER BY updated DESC');
    return parts.join(' AND ');
  }
}
