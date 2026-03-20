/**
 * GitHub connector for Ody Refine.
 * Reads repository docs, issues, PRs, and discussions via GitHub API.
 * Auth: Personal access token (GITHUB_TOKEN) or OAuth.
 * @module connectors/github
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
import type { ParentRef } from './types.js';
import { GitHubApiClient, isDocFile } from './github-api.js';
import {
  parseRepoId, buildIssueDoc, buildPRDoc, buildDiscussionDoc,
} from './github-doc-builders.js';

/**
 * GitHub connector — reads docs, issues, PRs, and discussions.
 *
 * Auth: api-key (PAT via GITHUB_TOKEN) or oauth.
 * Sources: repositories accessible to the authenticated user.
 * Documents: doc files, issue descriptions+comments, PR descriptions+comments,
 *   discussion posts+replies.
 * Write-back: not supported.
 */
export class GitHubConnector implements RefineConnector {
  readonly name = 'github';
  readonly displayName = 'GitHub';
  readonly authMethods: AuthMethod[] = ['api-key', 'oauth'];
  readonly supportsWriteBack = false;

  private client: GitHubApiClient | null = null;

  /** @inheritdoc */
  async authenticate(auth: ConnectorAuth): Promise<void> {
    const token = auth.token || process.env['GITHUB_TOKEN'];
    if (!token) {
      throw new ConnectorAuthError(
        'github', 'Token required. Set GITHUB_TOKEN or pass auth.token.',
      );
    }
    const client = new GitHubApiClient(token);
    if (!await client.validateToken()) {
      throw new ConnectorAuthError('github', 'Invalid token or insufficient permissions');
    }
    this.client = client;
  }

  /** @inheritdoc */
  async listSources(): Promise<ConnectorSource[]> {
    const client = this.ensureClient();
    const repos = await client.listRepos();
    return repos.map((r) => ({
      id: r.full_name,
      name: r.full_name,
      type: 'repository',
      estimatedDocCount: undefined,
    }));
  }

  /** @inheritdoc */
  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.ensureClient();
    let processed = 0;
    for (const source of sources) {
      const [owner, repo] = parseRepoId(source.id);
      const base: ParentRef[] = [
        { type: 'org', name: owner }, { type: 'repo', name: repo },
      ];
      onProgress?.({
        phase: 'fetch', current: processed, total: sources.length,
        message: `Scanning: ${source.id}...`,
      });
      yield* this.fetchDocFiles(client, owner, repo, base);
      yield* this.fetchIssueDocs(client, owner, repo, base);
      yield* this.fetchPRDocs(client, owner, repo, base);
      yield* this.fetchDiscussionDocs(client, owner, repo, base);
      processed++;
      onProgress?.({
        phase: 'fetch', current: processed, total: sources.length,
        message: `Done ${source.id}`,
      });
    }
  }

  /** @inheritdoc */
  getInitialCursor(): SyncCursor {
    return {
      type: 'timestamp',
      value: new Date().toISOString(),
      connectorName: 'github',
      updatedAt: new Date().toISOString(),
    };
  }

  /** @inheritdoc */
  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    const client = this.ensureClient();
    const repos = await client.listRepos();
    const since = cursor ? new Date(cursor.value) : undefined;
    const filtered = since
      ? repos.filter((r) => new Date(r.pushed_at) >= since)
      : repos;
    const sinceIso = since?.toISOString();

    for (const r of filtered) {
      const [owner, repo] = [r.owner.login, r.name];
      const base: ParentRef[] = [
        { type: 'org', name: owner }, { type: 'repo', name: repo },
      ];
      for await (const doc of this.fetchIssueDocs(client, owner, repo, base, sinceIso)) {
        yield { document: doc, action: 'upsert' };
      }
      for await (const doc of this.fetchPRDocs(client, owner, repo, base, sinceIso)) {
        yield { document: doc, action: 'upsert' };
      }
    }
  }

  /** @inheritdoc */
  async writeBack(
    documentId: string, _correctedContent: string, _reason: string,
  ): Promise<WriteBackResult> {
    return {
      documentId, success: false,
      error: 'Write-back is not supported for GitHub.',
    };
  }

  /** @inheritdoc */
  async validate(): Promise<boolean> {
    if (!this.client) return false;
    return this.client.validateToken();
  }

  private ensureClient(): GitHubApiClient {
    if (!this.client) {
      throw new ConnectorAuthError(
        'github', 'Not authenticated. Call authenticate() first.',
      );
    }
    return this.client;
  }

  /** Fetch doc files (README, CONTRIBUTING, docs/**\/*.md) from a repo. */
  private async *fetchDocFiles(
    client: GitHubApiClient, owner: string, repo: string, base: ParentRef[],
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    try {
      const tree = await client.getRepoTree(owner, repo);
      const docItems = tree.filter((i) => i.type === 'blob' && isDocFile(i.path));
      for (const item of docItems) {
        try {
          const content = await client.getFileContent(owner, repo, item.path);
          if (content.length < 20) continue;
          yield {
            id: `github:doc:${owner}/${repo}:${item.path}`,
            title: item.path, content, sourceType: 'github',
            sourceUrl: `https://github.com/${owner}/${repo}/blob/HEAD/${item.path}`,
            metadata: {
              owner, repo, path: item.path,
              parentChain: [...base, { type: 'docs', name: 'Documentation' }],
              analysisHints: { factDensity: 'normal' as const, authoritative: true },
            },
          };
        } catch { /* skip individual file errors */ }
      }
    } catch { /* skip tree errors */ }
  }

  /** Fetch issues + comments from a repo. */
  private async *fetchIssueDocs(
    client: GitHubApiClient, owner: string, repo: string,
    base: ParentRef[], since?: string,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    try {
      const issues = await client.listIssues(owner, repo, since);
      for (const issue of issues) {
        const doc = await buildIssueDoc(client, owner, repo, issue, base);
        if (doc) yield doc;
      }
    } catch { /* skip issue errors */ }
  }

  /** Fetch PRs + comments from a repo. */
  private async *fetchPRDocs(
    client: GitHubApiClient, owner: string, repo: string,
    base: ParentRef[], since?: string,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    try {
      const prs = await client.listPRs(owner, repo, since);
      for (const pr of prs) {
        const doc = await buildPRDoc(client, owner, repo, pr, base);
        if (doc) yield doc;
      }
    } catch { /* skip PR errors */ }
  }

  /** Fetch discussions + replies from a repo (if enabled). */
  private async *fetchDiscussionDocs(
    client: GitHubApiClient, owner: string, repo: string, base: ParentRef[],
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    try {
      const discussions = await client.listDiscussions(owner, repo);
      for (const disc of discussions) {
        const doc = buildDiscussionDoc(owner, repo, disc, base);
        if (doc) yield doc;
      }
    } catch { /* skip discussion errors (disabled or no access) */ }
  }
}
