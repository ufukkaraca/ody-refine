/** Helper functions to build ConnectorDocuments from GitHub API entities. */
import type { ConnectorDocument, ParentRef } from './types.js';
import type { GitHubApiClient, GitHubIssue, GitHubPR, GitHubDiscussion } from './github-api.js';

/** Parse "owner/repo" into [owner, repo]. */
export function parseRepoId(id: string): [string, string] {
  const parts = id.split('/');
  return [parts[0]!, parts[1]!];
}

/** Build a ConnectorDocument from a GitHub issue + its comments. */
export async function buildIssueDoc(
  client: GitHubApiClient, owner: string, repo: string,
  issue: GitHubIssue, base: ParentRef[],
): Promise<ConnectorDocument | null> {
  const comments = issue.comments > 0
    ? await client.getIssueComments(owner, repo, issue.number) : [];
  const lines = [`# ${issue.title}`, '', issue.body ?? ''];
  for (const c of comments) {
    lines.push('', '---', `**${c.user?.login ?? 'unknown'}:**`, c.body);
  }
  const content = lines.join('\n').trim();
  if (content.length < 20) return null;
  return {
    id: `github:issue:${owner}/${repo}:${issue.number}`,
    title: `#${issue.number}: ${issue.title}`, content, sourceType: 'github',
    sourceUrl: issue.html_url, lastModified: new Date(issue.updated_at),
    author: issue.user?.login,
    metadata: {
      owner, repo, issueNumber: issue.number, state: issue.state,
      parentChain: [...base, { type: 'issues', name: 'Issues' }],
      analysisHints: { factDensity: 'normal' as const, authoritative: false },
    },
  };
}

/** Build a ConnectorDocument from a GitHub PR + its comments. */
export async function buildPRDoc(
  client: GitHubApiClient, owner: string, repo: string,
  pr: GitHubPR, base: ParentRef[],
): Promise<ConnectorDocument | null> {
  const comments = await client.getPRComments(owner, repo, pr.number);
  const lines = [`# ${pr.title}`, '', pr.body ?? ''];
  for (const c of comments) {
    lines.push('', '---', `**${c.user?.login ?? 'unknown'}:**`, c.body);
  }
  const content = lines.join('\n').trim();
  if (content.length < 20) return null;
  return {
    id: `github:pr:${owner}/${repo}:${pr.number}`,
    title: `PR #${pr.number}: ${pr.title}`, content, sourceType: 'github',
    sourceUrl: pr.html_url, lastModified: new Date(pr.updated_at),
    author: pr.user?.login,
    metadata: {
      owner, repo, prNumber: pr.number, state: pr.state,
      parentChain: [...base, { type: 'pulls', name: 'Pull Requests' }],
      analysisHints: { factDensity: 'normal' as const, authoritative: false },
    },
  };
}

/** Build a ConnectorDocument from a GitHub discussion + its replies. */
export function buildDiscussionDoc(
  owner: string, repo: string,
  disc: GitHubDiscussion, base: ParentRef[],
): ConnectorDocument | null {
  const lines = [`# ${disc.title}`, '', disc.body];
  for (const c of disc.comments) {
    lines.push('', '---', `**${c.author}:**`, c.body);
  }
  const content = lines.join('\n').trim();
  if (content.length < 20) return null;
  return {
    id: `github:discussion:${owner}/${repo}:${disc.number}`,
    title: `Discussion #${disc.number}: ${disc.title}`, content,
    sourceType: 'github', sourceUrl: disc.url,
    lastModified: new Date(disc.updatedAt), author: disc.author,
    metadata: {
      owner, repo, discussionNumber: disc.number,
      parentChain: [...base, { type: 'discussions', name: 'Discussions' }],
      analysisHints: { factDensity: 'normal' as const, authoritative: false },
    },
  };
}
