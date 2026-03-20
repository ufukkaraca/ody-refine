/**
 * Jira connector for Ody Refine.
 * Reads Jira Cloud issues via REST API v3, normalizes to ConnectorDocument.
 * Supports Basic auth (email + API token) and OAuth (bearer token with cloudId).
 * @module connectors/jira
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
import { validateConnectorUrl } from './resolve-credential.js';
import { JiraApiClient } from './jira-api.js';
import type { JiraAuthMode, JiraIssue } from './jira-api.js';

/**
 * Jira connector — reads projects and issues, converts to markdown.
 * Auth: api-key (Basic with email+token) or oauth (Bearer with cloudId).
 * Env fallbacks: JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN.
 */
export class JiraConnector implements RefineConnector {
  readonly name = 'jira';
  readonly displayName = 'Jira';
  readonly authMethods: AuthMethod[] = ['api-key', 'oauth'];
  readonly supportsWriteBack = false;

  private client: JiraApiClient | null = null;

  /** @inheritdoc */
  async authenticate(auth: ConnectorAuth): Promise<void> {
    const { baseUrl, authMode } = this.resolveAuth(auth);
    const client = new JiraApiClient(baseUrl, authMode);
    const valid = await client.validateCredentials();
    if (!valid) {
      throw new ConnectorAuthError(
        'jira', 'Invalid credentials or insufficient permissions',
      );
    }
    this.client = client;
  }

  /** @inheritdoc */
  async listSources(): Promise<ConnectorSource[]> {
    const client = this.ensureClient();
    const projects = await client.fetchProjects();
    return projects.map((p) => ({
      id: p.key,
      name: `${p.name} (${p.key})`,
      type: 'project',
    }));
  }

  /** @inheritdoc */
  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.ensureClient();
    const projectKeys = sources.map((s) => s.id);
    onProgress?.({
      phase: 'fetch', current: 0, total: 0, message: 'Fetching Jira issues...',
    });

    const issues = await client.fetchIssues(projectKeys);
    let current = 0;

    for (const issue of issues) {
      const doc = issueToDocument(client, issue);
      if (doc) {
        current++;
        onProgress?.({
          phase: 'fetch', current, total: issues.length, message: issue.key,
        });
        yield doc;
      }
    }
    onProgress?.({ phase: 'fetch', current, total: current });
  }

  /** @inheritdoc */
  getInitialCursor(): SyncCursor {
    return {
      type: 'timestamp',
      value: new Date().toISOString(),
      connectorName: 'jira',
      updatedAt: new Date().toISOString(),
    };
  }

  /** @inheritdoc */
  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    const client = this.ensureClient();
    const issues = await client.fetchIssues(undefined, cursor?.value);

    for (const issue of issues) {
      const doc = issueToDocument(client, issue);
      if (doc) yield { document: doc, action: 'upsert' };
    }
  }

  /** @inheritdoc */
  async writeBack(
    documentId: string,
    _correctedContent: string,
    _reason: string,
  ): Promise<WriteBackResult> {
    return {
      documentId,
      success: false,
      error: 'Write-back is not yet implemented for Jira. Edit the issue directly.',
    };
  }

  /** @inheritdoc */
  async validate(): Promise<boolean> {
    if (!this.client) return false;
    return this.client.validateCredentials();
  }

  /** Resolve auth params from ConnectorAuth + env fallbacks. */
  private resolveAuth(auth: ConnectorAuth): {
    baseUrl: string;
    authMode: JiraAuthMode;
  } {
    if (auth.method === 'oauth') {
      if (!auth.token) {
        throw new ConnectorAuthError('jira', 'OAuth access token is required');
      }
      const cloudId = auth.params?.['cloudId'];
      if (!cloudId) {
        throw new ConnectorAuthError(
          'jira', 'cloudId is required for OAuth. Pass it in auth.params.cloudId.',
        );
      }
      return {
        baseUrl: `https://api.atlassian.com/ex/jira/${cloudId}`,
        authMode: { type: 'oauth', accessToken: auth.token },
      };
    }

    const baseUrl = auth.params?.['baseUrl'] ?? process.env['JIRA_URL'] ?? '';
    if (baseUrl) validateConnectorUrl(baseUrl);
    const email = auth.params?.['email'] ?? process.env['JIRA_EMAIL'] ?? '';
    const apiToken = auth.token || process.env['JIRA_API_TOKEN'] || '';

    if (!baseUrl) {
      throw new ConnectorAuthError(
        'jira', 'Base URL is required. Set JIRA_URL or pass auth.params.baseUrl.',
      );
    }
    if (!email) {
      throw new ConnectorAuthError(
        'jira', 'Email is required. Set JIRA_EMAIL or pass auth.params.email.',
      );
    }
    if (!apiToken) {
      throw new ConnectorAuthError(
        'jira', 'API token is required. Set JIRA_API_TOKEN or pass auth.token.',
      );
    }

    return {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      authMode: { type: 'basic', email, apiToken },
    };
  }

  /** Guard: throw if not authenticated, return client. */
  private ensureClient(): JiraApiClient {
    if (!this.client) {
      throw new ConnectorAuthError(
        'jira', 'Not authenticated. Call authenticate() first.',
      );
    }
    return this.client;
  }
}

// --- Conversion helpers ---

/** Convert a Jira issue to a ConnectorDocument, or null if too short. */
export function issueToDocument(
  client: JiraApiClient,
  issue: JiraIssue,
): ConnectorDocument | null {
  const { description, comments, issueUrl } = client.extractIssueText(issue);
  const lines: string[] = [
    `# ${issue.key}: ${issue.fields.summary}`,
    '',
    `**Status:** ${issue.fields.status.name}`,
  ];
  if (issue.fields.assignee) {
    lines.push(`**Assignee:** ${issue.fields.assignee.displayName}`);
  }
  if (issue.fields.labels.length > 0) {
    lines.push(`**Labels:** ${issue.fields.labels.join(', ')}`);
  }
  lines.push('');
  if (description) {
    lines.push('## Description', '', description, '');
  }
  if (comments.length > 0) {
    lines.push('## Comments', '');
    for (const c of comments) lines.push(c, '');
  }
  const content = lines.join('\n').trim();
  if (content.length < 20) return null;

  const projectKey = issue.key.split('-')[0] ?? 'Project';
  return {
    id: `jira:issue:${issue.id}`,
    title: `${issue.key}: ${issue.fields.summary}`,
    content,
    sourceType: 'jira',
    sourceUrl: issueUrl,
    lastModified: new Date(issue.fields.updated),
    author: issue.fields.assignee?.displayName,
    metadata: {
      jiraId: issue.id,
      issueKey: issue.key,
      status: issue.fields.status.name,
      labels: issue.fields.labels,
      commentCount: comments.length,
      parentChain: [
        { type: 'project', name: projectKey },
        { type: 'issue', name: issue.key, id: issue.id },
      ],
      analysisHints: { factDensity: 'normal' as const, authoritative: false },
    },
  };
}
