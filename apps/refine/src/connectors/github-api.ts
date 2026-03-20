/** GitHub REST API v3 + GraphQL v4 client with rate limit handling. */
import {
  ConnectorError, ConnectorAuthError,
  ConnectorRateLimitError, ConnectorServerError,
} from './types.js';
import { withConnectorRetry } from './retry.js';
import type {
  GitHubRepo, GitHubIssue, GitHubComment, GitHubPR,
  GitHubTreeItem, GitHubDiscussion,
} from './github-types.js';

export type { GitHubRepo, GitHubIssue, GitHubComment, GitHubPR, GitHubTreeItem, GitHubDiscussion };

const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';
const MAX_PAGES = 10, PER_PAGE = 100, MAX_RETRIES = 3;

/** Doc file patterns to scan in repositories. */
const DOC_PATTERNS = [
  /^README\.md$/i,
  /^CONTRIBUTING\.md$/i,
  /^CHANGELOG\.md$/i,
  /^docs?\/.+\.md$/i,
  /^\.github\/[^/]+\.md$/i,
];

/** Check if a file path matches documentation patterns. */
export function isDocFile(path: string): boolean {
  return DOC_PATTERNS.some((p) => p.test(path));
}

/**
 * GitHub API client. Supports REST v3 and GraphQL v4.
 * Auth: Bearer token (PAT or OAuth). Rate limit: 5000 req/hr authenticated.
 */
export class GitHubApiClient {
  constructor(private readonly token: string) {}

  /** Validate token by fetching authenticated user. */
  async validateToken(): Promise<boolean> {
    try {
      await this.apiFetch<{ login: string }>(`${GITHUB_API}/user`);
      return true;
    } catch { return false; }
  }

  /** List repositories accessible to the authenticated user. */
  async listRepos(): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await this.apiFetch<GitHubRepo[]>(
        `${GITHUB_API}/user/repos?per_page=${PER_PAGE}&page=${page}&sort=pushed&type=all`,
      );
      repos.push(...batch);
      if (batch.length < PER_PAGE) break;
    }
    return repos;
  }

  /** Get the full file tree for a repo (recursive). */
  async getRepoTree(
    owner: string, repo: string, branch = 'HEAD',
  ): Promise<GitHubTreeItem[]> {
    const data = await this.apiFetch<{ tree: GitHubTreeItem[] }>(
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    );
    return data.tree;
  }

  /** Get file content from a repo (base64-decoded). */
  async getFileContent(
    owner: string, repo: string, path: string,
  ): Promise<string> {
    const data = await this.apiFetch<{
      content: string; encoding: string;
    }>(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`);
    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return data.content;
  }

  /** List issues (excludes PRs) for a repo, optionally since a date. */
  async listIssues(
    owner: string, repo: string, since?: string,
  ): Promise<GitHubIssue[]> {
    const issues: GitHubIssue[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      let url = `${GITHUB_API}/repos/${owner}/${repo}/issues` +
        `?per_page=${PER_PAGE}&page=${page}&state=all&sort=updated`;
      if (since) url += `&since=${since}`;
      const batch = await this.apiFetch<GitHubIssue[]>(url);
      issues.push(...batch.filter((i) => !i.pull_request));
      if (batch.length < PER_PAGE) break;
    }
    return issues;
  }

  /** Get comments for an issue. */
  async getIssueComments(
    owner: string, repo: string, issueNumber: number,
  ): Promise<GitHubComment[]> {
    return this.apiFetch<GitHubComment[]>(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=${PER_PAGE}`,
    );
  }

  /** List pull requests, optionally filtered by updated_at. */
  async listPRs(
    owner: string, repo: string, since?: string,
  ): Promise<GitHubPR[]> {
    const prs: GitHubPR[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls` +
        `?per_page=${PER_PAGE}&page=${page}&state=all&sort=updated&direction=desc`;
      const batch = await this.apiFetch<GitHubPR[]>(url);
      if (since) {
        const sinceDate = new Date(since);
        const filtered = batch.filter((pr) => new Date(pr.updated_at) >= sinceDate);
        prs.push(...filtered);
        if (filtered.length < batch.length) break;
      } else {
        prs.push(...batch);
      }
      if (batch.length < PER_PAGE) break;
    }
    return prs;
  }

  /** Get both issue comments and review comments for a PR. */
  async getPRComments(
    owner: string, repo: string, prNumber: number,
  ): Promise<GitHubComment[]> {
    const [issue, review] = await Promise.all([
      this.apiFetch<GitHubComment[]>(
        `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=${PER_PAGE}`,
      ),
      this.apiFetch<GitHubComment[]>(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=${PER_PAGE}`,
      ),
    ]);
    return [...issue, ...review];
  }

  /** List discussions via GraphQL (requires discussions enabled). */
  async listDiscussions(
    owner: string, repo: string,
  ): Promise<GitHubDiscussion[]> {
    const query = `query($owner:String!,$repo:String!,$first:Int!,$after:String){
      repository(owner:$owner,name:$repo){discussions(first:$first,after:$after){
      nodes{number title body author{login}url createdAt updatedAt
      comments(first:10){nodes{body author{login}createdAt}}}
      pageInfo{hasNextPage endCursor}}}}`;
    const discussions: GitHubDiscussion[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      type DiscNode = {
        number: number; title: string; body: string;
        author: { login: string } | null; url: string;
        createdAt: string; updatedAt: string;
        comments: { nodes: Array<{ body: string; author: { login: string } | null; createdAt: string }> };
      };
      const data = await this.graphqlFetch<{
        repository: { discussions: { nodes: DiscNode[]; pageInfo: { hasNextPage: boolean; endCursor: string } } };
      }>(query, { owner, repo, first: 50, after });
      for (const d of data.repository.discussions.nodes) {
        discussions.push({
          number: d.number, title: d.title, body: d.body,
          author: d.author?.login ?? 'unknown', url: d.url,
          createdAt: d.createdAt, updatedAt: d.updatedAt,
          comments: d.comments.nodes.map((c) => ({
            body: c.body, author: c.author?.login ?? 'unknown', createdAt: c.createdAt,
          })),
        });
      }
      if (!data.repository.discussions.pageInfo.hasNextPage) break;
      after = data.repository.discussions.pageInfo.endCursor;
    }
    return discussions;
  }

  /** Throw typed errors for HTTP status codes. */
  private static checkStatus(response: Response, op: string): void {
    if (response.status === 401) throw new ConnectorAuthError('github', 'HTTP 401 Unauthorized');
    if (response.status === 429 ||
        (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0')) {
      throw new ConnectorRateLimitError('github',
        parseInt(response.headers.get('Retry-After') ?? '60', 10));
    }
    if (response.status === 403) throw new ConnectorAuthError('github', 'HTTP 403 Forbidden');
    if (response.status >= 500) throw new ConnectorServerError('github', response.status);
    if (!response.ok) {
      throw new ConnectorError('github', op, `HTTP ${response.status} ${response.statusText}`);
    }
  }

  /** REST API fetch with typed retry via withConnectorRetry. */
  private async apiFetch<T>(url: string): Promise<T> {
    return withConnectorRetry(async () => {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      GitHubApiClient.checkStatus(response, 'apiFetch');
      return (await response.json()) as T;
    }, { maxRetries: MAX_RETRIES });
  }

  /** GraphQL API fetch with typed retry via withConnectorRetry. */
  private async graphqlFetch<T>(
    query: string, variables: Record<string, unknown>,
  ): Promise<T> {
    return withConnectorRetry(async () => {
      const response = await fetch(GITHUB_GRAPHQL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
      GitHubApiClient.checkStatus(response, 'graphql');
      const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors?.length) {
        throw new ConnectorError('github', 'graphql', json.errors[0]!.message);
      }
      return json.data as T;
    }, { maxRetries: MAX_RETRIES });
  }
}
