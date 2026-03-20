/**
 * Deep audit multi-source collector.
 * Fetches documents from local files + connectors, writes them to a
 * staging directory, then runs the standard ingest pipeline on the
 * combined corpus.
 * @module commands/audit-deep
 */
import { mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import { getConnector } from '../connectors/index.js';
import type {
  ConnectorDocument,
  ConnectorSource,
  RefineConnector,
} from '../connectors/types.js';
import { resolveConnectorToken } from '../connectors/resolve-credential.js';

/** Options for the deep audit collector. */
export interface DeepAuditOptions {
  /** Local directory to include (optional). */
  dir?: string;
  /** Include Notion sources. */
  includeNotion?: boolean;
  /** Include Slack sources. */
  includeSlack?: boolean;
  /** Include Confluence sources. */
  includeConfluence?: boolean;
  /** Include Jira sources. */
  includeJira?: boolean;
  /** Explicit Notion token override. */
  notionToken?: string;
  /** Explicit Slack token override. */
  slackToken?: string;
  /** Explicit Confluence token override. */
  confluenceToken?: string;
  /** Explicit Confluence URL override. */
  confluenceUrl?: string;
  /** Explicit Confluence email override. */
  confluenceEmail?: string;
  /** Explicit Jira token override. */
  jiraToken?: string;
  /** Explicit Jira URL override. */
  jiraUrl?: string;
  /** Explicit Jira email override. */
  jiraEmail?: string;
  /** Progress callback. */
  onProgress?: (message: string) => void;
}

/** Result of the collection phase. */
export interface DeepAuditCollectionResult {
  /** Path to the staging directory containing all collected markdown. */
  stagingDir: string;
  /** Number of local files copied. */
  localFileCount: number;
  /** Number of Notion documents fetched. */
  notionDocCount: number;
  /** Number of Slack documents fetched. */
  slackDocCount: number;
  /** Number of Confluence documents fetched. */
  confluenceDocCount: number;
  /** Number of Jira documents fetched. */
  jiraDocCount: number;
  /** Total documents in the staging directory. */
  totalDocCount: number;
}

/**
 * Collect documents from multiple sources into a single staging directory.
 * Does NOT run the pipeline — the caller (audit command) does that.
 */
export async function collectDeepAuditSources(
  options: DeepAuditOptions,
): Promise<DeepAuditCollectionResult> {
  const stagingDir = join(
    tmpdir(),
    `ody-refine-deep-${crypto.randomUUID().slice(0, 8)}`,
  );
  mkdirSync(stagingDir, { recursive: true });

  const result: DeepAuditCollectionResult = {
    stagingDir,
    localFileCount: 0,
    notionDocCount: 0,
    slackDocCount: 0,
    confluenceDocCount: 0,
    jiraDocCount: 0,
    totalDocCount: 0,
  };

  // 1. Copy local files
  if (options.dir) {
    result.localFileCount = copyLocalFiles(options.dir, stagingDir);
    options.onProgress?.(
      `Collected ${String(result.localFileCount)} local files`,
    );
  }

  // 2. Fetch from Notion
  if (options.includeNotion) {
    const resolved = await resolveConnectorToken('notion', options.notionToken);
    if (!resolved) {
      throw new Error(
        'Notion token required. Run `ody-refine connect notion`, ' +
        'set NOTION_TOKEN, or pass --notion-token.',
      );
    }
    result.notionDocCount = await fetchConnectorDocs(
      'notion', resolved.token, resolved.method, stagingDir,
      options.onProgress,
    );
    options.onProgress?.(
      `Collected ${String(result.notionDocCount)} Notion documents`,
    );
  }

  // 3. Fetch from Slack
  if (options.includeSlack) {
    const resolved = await resolveConnectorToken('slack', options.slackToken);
    if (!resolved) {
      throw new Error(
        'Slack token required. Run `ody-refine connect slack`, ' +
        'set SLACK_BOT_TOKEN, or pass --slack-token.',
      );
    }
    result.slackDocCount = await fetchConnectorDocs(
      'slack', resolved.token, resolved.method, stagingDir,
      options.onProgress, { minThreadReplies: '0' },
    );
    options.onProgress?.(
      `Collected ${String(result.slackDocCount)} Slack documents`,
    );
  }

  // 4. Fetch from Confluence
  if (options.includeConfluence) {
    const resolved = await resolveConnectorToken(
      'confluence', options.confluenceToken,
    );
    if (!resolved) {
      throw new Error(
        'Confluence token required. Run `ody-refine connect confluence`, ' +
        'set CONFLUENCE_API_TOKEN, or pass --confluence-token.',
      );
    }
    const params = buildAtlassianParams(
      options.confluenceUrl, options.confluenceEmail,
      'CONFLUENCE_URL', 'CONFLUENCE_EMAIL',
    );
    result.confluenceDocCount = await fetchConnectorDocs(
      'confluence', resolved.token, resolved.method, stagingDir,
      options.onProgress, params,
    );
    options.onProgress?.(
      `Collected ${String(result.confluenceDocCount)} Confluence documents`,
    );
  }

  // 5. Fetch from Jira
  if (options.includeJira) {
    const resolved = await resolveConnectorToken('jira', options.jiraToken);
    if (!resolved) {
      throw new Error(
        'Jira token required. Run `ody-refine connect jira`, ' +
        'set JIRA_API_TOKEN, or pass --jira-token.',
      );
    }
    const params = buildAtlassianParams(
      options.jiraUrl, options.jiraEmail,
      'JIRA_URL', 'JIRA_EMAIL',
    );
    result.jiraDocCount = await fetchConnectorDocs(
      'jira', resolved.token, resolved.method, stagingDir,
      options.onProgress, params,
    );
    options.onProgress?.(
      `Collected ${String(result.jiraDocCount)} Jira documents`,
    );
  }

  result.totalDocCount =
    result.localFileCount + result.notionDocCount + result.slackDocCount +
    result.confluenceDocCount + result.jiraDocCount;

  return result;
}

/**
 * Copy markdown and PDF files from a local directory into the staging dir.
 * Files are prefixed with "local-" to avoid name collisions.
 */
function copyLocalFiles(sourceDir: string, stagingDir: string): number {
  const SUPPORTED_EXTS = new Set(['.md', '.markdown', '.pdf', '.txt']);
  let count = 0;

  const entries = readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) continue;

    const dest = join(stagingDir, `local-${entry.name}`);
    copyFileSync(join(sourceDir, entry.name), dest);
    count++;
  }

  return count;
}

/**
 * Build params for Atlassian connectors (Confluence/Jira) from CLI
 * flags and env-var fallbacks. Returns undefined if no params needed.
 */
function buildAtlassianParams(
  url: string | undefined,
  email: string | undefined,
  urlEnv: string,
  emailEnv: string,
): Record<string, string> | undefined {
  const baseUrl = url ?? process.env[urlEnv];
  const emailVal = email ?? process.env[emailEnv];
  if (!baseUrl && !emailVal) return undefined;
  const params: Record<string, string> = {};
  if (baseUrl) params['baseUrl'] = baseUrl;
  if (emailVal) params['email'] = emailVal;
  return params;
}

/**
 * Authenticate a connector, discover sources, fetch all docs, and write
 * them as markdown into the staging directory.
 */
async function fetchConnectorDocs(
  connectorName: string,
  token: string,
  authMethod: import('../connectors/types.js').AuthMethod,
  stagingDir: string,
  onProgress?: (message: string) => void,
  params?: Record<string, string>,
): Promise<number> {
  const connector: RefineConnector = getConnector(connectorName);
  const auth = { method: authMethod, token, params };

  onProgress?.(`Authenticating with ${connector.displayName}...`);
  await connector.authenticate(auth);

  onProgress?.(`Discovering ${connector.displayName} sources...`);
  const sources: ConnectorSource[] = await connector.listSources();
  onProgress?.(
    `Found ${String(sources.length)} ${connector.displayName} sources`,
  );

  let count = 0;
  for await (const doc of connector.fetchDocuments(sources)) {
    writeDocumentAsMarkdown(doc, stagingDir, connectorName);
    count++;
  }

  return count;
}

/** Write a ConnectorDocument to the staging directory as a markdown file. */
function writeDocumentAsMarkdown(
  doc: ConnectorDocument,
  stagingDir: string,
  prefix: string,
): void {
  const safeName = doc.title
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .slice(0, 60);
  const hash = crypto
    .createHash('md5')
    .update(doc.id)
    .digest('hex')
    .slice(0, 6);
  const filename = `${prefix}-${safeName || 'untitled'}-${hash}.md`;

  const frontmatter = [
    '---',
    `source: ${doc.sourceType}`,
    `id: ${doc.id}`,
    doc.sourceUrl ? `url: ${doc.sourceUrl}` : null,
    doc.author ? `author: ${doc.author}` : null,
    doc.lastModified
      ? `modified: ${doc.lastModified.toISOString()}`
      : null,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  const content = `${frontmatter}\n\n# ${doc.title}\n\n${doc.content}`;
  writeFileSync(join(stagingDir, filename), content, 'utf-8');
}
