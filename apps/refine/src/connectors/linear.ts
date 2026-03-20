/**
 * Linear connector for Ody Refine.
 * Reads Linear issues, projects, and documents via the GraphQL API.
 * Converts Linear content to markdown-normalized ConnectorDocuments.
 * Auth: OAuth browser flow or LINEAR_API_KEY env var for CI.
 * @module connectors/linear
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
import { LinearApiClient } from './linear-api.js';
import type { LinearIssue, LinearDocument } from './linear-api.js';

/**
 * Linear connector — reads issues, projects, and documents.
 *
 * Auth methods:
 * - api-key: Personal API key or LINEAR_API_KEY env var
 * - oauth: OAuth2 browser flow for `ody-refine connect linear`
 *
 * Sources: teams (each team is a source).
 * Documents: issues (with comments) + project documents, converted to markdown.
 * Write-back: update issue descriptions via the Linear API.
 */
export class LinearConnector implements RefineConnector {
  readonly name = 'linear';
  readonly displayName = 'Linear';
  readonly authMethods: AuthMethod[] = ['api-key', 'oauth'];
  readonly supportsWriteBack = true;

  private client: LinearApiClient | null = null;

  /** @inheritdoc */
  async authenticate(auth: ConnectorAuth): Promise<void> {
    const token = auth.token || process.env['LINEAR_API_KEY'];
    if (!token) {
      throw new ConnectorAuthError(
        'linear',
        'Token is required. Set LINEAR_API_KEY or pass a token.',
      );
    }

    const client = new LinearApiClient(token);
    const valid = await client.validateToken();
    if (!valid) {
      throw new ConnectorAuthError(
        'linear',
        'Invalid token or insufficient permissions',
      );
    }
    this.client = client;
  }

  /** @inheritdoc */
  async listSources(): Promise<ConnectorSource[]> {
    const client = this.ensureClient();
    const { teams, projects } = await client.fetchTeamsAndProjects();

    return teams.map((team) => {
      const teamProjects = projects.filter((p) => p.teamId === team.id);
      return {
        id: team.id,
        name: `${team.name} (${team.key})`,
        type: 'team',
        estimatedDocCount: teamProjects.length,
      };
    });
  }

  /** @inheritdoc */
  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.ensureClient();
    const teamIds = sources.map((s) => s.id);
    let current = 0;

    // Fetch issues for selected teams
    onProgress?.({
      phase: 'fetch', current: 0, total: 0, message: 'Fetching issues...',
    });
    const issues = await client.fetchIssues(teamIds);

    for (const issue of issues) {
      const doc = issueToDocument(issue);
      if (doc) {
        current++;
        onProgress?.({
          phase: 'fetch', current, total: issues.length, message: issue.identifier,
        });
        yield doc;
      }
    }

    // Fetch documents (project docs, wikis)
    onProgress?.({
      phase: 'fetch', current, total: 0, message: 'Fetching documents...',
    });
    const docs = await client.fetchDocuments();
    for (const linearDoc of docs) {
      const doc = linearDocToDocument(linearDoc);
      if (doc) {
        current++;
        onProgress?.({
          phase: 'fetch', current, total: issues.length + docs.length,
          message: linearDoc.title,
        });
        yield doc;
      }
    }

    onProgress?.({
      phase: 'fetch', current, total: current,
    });
  }

  /** @inheritdoc */
  getInitialCursor(): SyncCursor {
    return {
      type: 'timestamp',
      value: new Date().toISOString(),
      connectorName: 'linear',
      updatedAt: new Date().toISOString(),
    };
  }

  /** @inheritdoc */
  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    const client = this.ensureClient();
    const updatedAfter = cursor?.value;

    const issues = await client.fetchIssues(undefined, updatedAfter);
    for (const issue of issues) {
      const doc = issueToDocument(issue);
      if (doc) yield { document: doc, action: 'upsert' };
    }

    const docs = await client.fetchDocuments(updatedAfter);
    for (const linearDoc of docs) {
      const doc = linearDocToDocument(linearDoc);
      if (doc) yield { document: doc, action: 'upsert' };
    }
  }

  /**
   * Write-back: update an issue description via the Linear API.
   * Only supports issues (not documents) for now.
   */
  async writeBack(
    documentId: string,
    correctedContent: string,
    _reason: string,
  ): Promise<WriteBackResult> {
    const client = this.ensureClient();
    const parsed = parseDocumentId(documentId);
    if (!parsed) {
      return {
        documentId,
        success: false,
        error: 'Invalid document ID format. Expected linear:issue:<id> or linear:doc:<id>',
      };
    }

    if (parsed.type !== 'issue') {
      return {
        documentId,
        success: false,
        error: 'Write-back is only supported for issues, not documents.',
      };
    }

    try {
      await client.query(
        UPDATE_ISSUE_MUTATION,
        { id: parsed.id, description: correctedContent },
      );
      return {
        documentId,
        success: true,
        updatedUrl: `https://linear.app/issue/${parsed.id}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { documentId, success: false, error: msg };
    }
  }

  /** @inheritdoc */
  async validate(): Promise<boolean> {
    if (!this.client) return false;
    return this.client.validateToken();
  }

  /** Guard: throw if not authenticated, return client. */
  private ensureClient(): LinearApiClient {
    if (!this.client) {
      throw new ConnectorAuthError(
        'linear',
        'Not authenticated. Call authenticate() first.',
      );
    }
    return this.client;
  }
}

// --- Conversion helpers ---

/** Convert a Linear issue to a ConnectorDocument. */
export function issueToDocument(issue: LinearIssue): ConnectorDocument | null {
  const lines: string[] = [
    `# ${issue.identifier}: ${issue.title}`,
    '',
    `**Status:** ${issue.state.name}`,
  ];

  if (issue.assignee) {
    lines.push(`**Assignee:** ${issue.assignee.name}`);
  }

  const labelNames = issue.labels.nodes.map((l) => l.name);
  if (labelNames.length > 0) {
    lines.push(`**Labels:** ${labelNames.join(', ')}`);
  }

  if (issue.project) {
    lines.push(`**Project:** ${issue.project.name}`);
  }

  lines.push('');

  if (issue.description) {
    lines.push('## Description', '', issue.description, '');
  }

  const comments = issue.comments.nodes;
  if (comments.length > 0) {
    lines.push('## Comments', '');
    for (const comment of comments) {
      const author = comment.user?.name ?? 'Unknown';
      lines.push(`**${author}:**`, comment.body, '');
    }
  }

  const content = lines.join('\n').trim();
  // An issue with no title, no description, and no comments has no meaningful content
  const hasSubstance = !!(issue.title.trim() || issue.description || issue.comments.nodes.length > 0);
  if (!hasSubstance || content.length < 20) return null;

  const parentChain = [
    { type: 'team', name: issue.identifier.split('-')[0] ?? 'Team' },
    ...(issue.project
      ? [{ type: 'project', name: issue.project.name, id: issue.project.id }]
      : []),
    { type: 'issue', name: issue.identifier, id: issue.id },
  ];

  return {
    id: `linear:issue:${issue.id}`,
    title: `${issue.identifier}: ${issue.title}`,
    content,
    sourceType: 'linear',
    sourceUrl: issue.url,
    lastModified: new Date(issue.updatedAt),
    author: issue.assignee?.name,
    metadata: {
      linearId: issue.id,
      identifier: issue.identifier,
      status: issue.state.name,
      labels: labelNames,
      projectId: issue.project?.id,
      projectName: issue.project?.name,
      commentCount: comments.length,
      parentChain,
      analysisHints: { factDensity: 'normal' as const, authoritative: false },
    },
  };
}

/** Convert a Linear document to a ConnectorDocument. */
export function linearDocToDocument(
  doc: LinearDocument,
): ConnectorDocument | null {
  const content = doc.content?.trim();
  if (!content || content.length < 20) return null;

  const parentChain = doc.project
    ? [
      { type: 'project', name: doc.project.name, id: doc.project.id },
      { type: 'document', name: doc.title, id: doc.id },
    ]
    : [{ type: 'document', name: doc.title, id: doc.id }];

  return {
    id: `linear:doc:${doc.id}`,
    title: doc.title,
    content,
    sourceType: 'linear',
    lastModified: new Date(doc.updatedAt),
    author: doc.creator?.name,
    metadata: {
      linearId: doc.id,
      projectId: doc.project?.id,
      projectName: doc.project?.name,
      parentChain,
      analysisHints: { factDensity: 'normal' as const, authoritative: true },
    },
  };
}

/** Parse a linear document ID into type and ID. */
function parseDocumentId(
  docId: string,
): { type: 'issue' | 'doc'; id: string } | null {
  const parts = docId.split(':');
  if (parts.length !== 3 || parts[0] !== 'linear') return null;
  if (parts[1] !== 'issue' && parts[1] !== 'doc') return null;
  return { type: parts[1], id: parts[2]! };
}

/** GraphQL mutation to update an issue description. */
const UPDATE_ISSUE_MUTATION = `
  mutation($id: String!, $description: String!) {
    issueUpdate(id: $id, input: { description: $description }) {
      success
      issue { id identifier url }
    }
  }
`;
