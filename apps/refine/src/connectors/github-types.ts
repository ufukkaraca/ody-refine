/** GitHub API type definitions used by the GitHub connector and API client. */

/** GitHub repository metadata. */
export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  html_url: string;
  has_wiki: boolean;
  has_discussions: boolean;
  pushed_at: string;
  default_branch: string;
}

/** GitHub issue (excludes PRs). */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
  state: string;
  created_at: string;
  updated_at: string;
  labels: Array<{ name: string }>;
  comments: number;
  pull_request?: unknown;
}

/** GitHub comment on an issue or PR. */
export interface GitHubComment {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
  html_url: string;
}

/** GitHub pull request. */
export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
  state: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
}

/** GitHub tree item (file in repo). */
export interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
  size?: number;
}

/** Normalized GitHub discussion (from GraphQL). */
export interface GitHubDiscussion {
  number: number;
  title: string;
  body: string;
  author: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  comments: Array<{ body: string; author: string; createdAt: string }>;
}
