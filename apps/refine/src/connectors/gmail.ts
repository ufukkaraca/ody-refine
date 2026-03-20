/**
 * Gmail connector for Ody Refine.
 * Reads Gmail messages/threads via the Gmail REST API v1.
 * Converts messages to markdown-normalized ConnectorDocuments.
 * Auth: OAuth bearer token (Google OAuth2 via GMAIL_ACCESS_TOKEN).
 * @module connectors/gmail
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
import { GmailApiClient } from './gmail-api.js';
import type { GmailMessageSummary, GmailRefreshConfig } from './gmail-api.js';

/** System labels exposed as browsable sources. */
const DEFAULT_LABELS: Array<{ id: string; name: string }> = [
  { id: 'INBOX', name: 'Inbox' },
  { id: 'SENT', name: 'Sent' },
  { id: 'IMPORTANT', name: 'Important' },
  { id: 'STARRED', name: 'Starred' },
];

/**
 * Gmail connector — reads messages and converts to markdown documents.
 *
 * Auth: oauth (Bearer token from Google OAuth2).
 * Env fallback: GMAIL_ACCESS_TOKEN.
 *
 * Sources: Gmail labels (system + user labels).
 * Documents: individual email messages, normalized to markdown.
 * Write-back: not supported (Gmail messages are immutable).
 */
export class GmailConnector implements RefineConnector {
  readonly name = 'gmail';
  readonly displayName = 'Gmail';
  readonly authMethods: AuthMethod[] = ['oauth'];
  readonly supportsWriteBack = false;

  private client: GmailApiClient | null = null;
  private redactPii = true;

  /** @inheritdoc */
  async authenticate(auth: ConnectorAuth): Promise<void> {
    const token = auth.token || process.env['GMAIL_ACCESS_TOKEN'];
    if (!token) {
      throw new ConnectorAuthError(
        'gmail',
        'Access token is required. Set GMAIL_ACCESS_TOKEN or pass auth.token.',
      );
    }
    const client = new GmailApiClient(token, buildRefreshConfig(auth));
    const valid = await client.validateToken();
    if (!valid) {
      throw new ConnectorAuthError(
        'gmail', 'Invalid token or insufficient permissions',
      );
    }
    this.client = client;
    if (auth.params?.['redactPii'] === 'false') this.redactPii = false;
  }

  /** @inheritdoc */
  async listSources(): Promise<ConnectorSource[]> {
    const client = this.ensureClient();
    const labels = await client.fetchLabels();

    // Merge system defaults (always present) with user labels
    const sources: ConnectorSource[] = DEFAULT_LABELS.map((dl) => {
      const apiLabel = labels.find((l) => l.id === dl.id);
      return {
        id: dl.id,
        name: dl.name,
        type: 'label',
        estimatedDocCount: apiLabel?.messagesTotal,
      };
    });

    // Append user-created labels
    for (const label of labels) {
      if (label.type === 'user') {
        sources.push({
          id: label.id,
          name: label.name,
          type: 'label',
          estimatedDocCount: label.messagesTotal,
        });
      }
    }

    return sources;
  }

  /** @inheritdoc */
  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.ensureClient();
    let processed = 0;
    const total = sources.length;

    for (const source of sources) {
      onProgress?.({
        phase: 'fetch', current: processed, total,
        message: `Fetching label: ${source.name}...`,
      });

      const query = `label:${source.id}`;
      const messages = await client.listMessages(query);

      for (const msg of messages) {
        const doc = messageToDocument(msg, source, this.redactPii);
        if (doc) yield doc;
      }

      processed++;
      onProgress?.({
        phase: 'fetch', current: processed, total,
        message: `Done ${source.name} (${messages.length} messages)`,
      });
    }
  }

  /** @inheritdoc */
  getInitialCursor(): SyncCursor {
    return {
      type: 'change-token',
      value: String(Math.floor(Date.now() / 1000)),
      connectorName: 'gmail',
      updatedAt: new Date().toISOString(),
    };
  }

  /** @inheritdoc */
  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    const client = this.ensureClient();
    const query = cursor ? `after:${cursor.value}` : undefined;
    const messages = await client.listMessages(query);

    for (const msg of messages) {
      const doc = messageToDocument(msg, undefined, this.redactPii);
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
      error: 'Write-back is not supported for Gmail. Email messages are immutable.',
    };
  }

  /** @inheritdoc */
  async validate(): Promise<boolean> {
    if (!this.client) return false;
    return this.client.validateToken();
  }

  /** Guard: throw if not authenticated. */
  private ensureClient(): GmailApiClient {
    if (!this.client) {
      throw new ConnectorAuthError(
        'gmail', 'Not authenticated. Call authenticate() first.',
      );
    }
    return this.client;
  }
}

// --- Helpers ---

/** Redact email addresses: local part to first char + *** (e.g., "a***@example.com"). */
export function redactEmail(email: string): string {
  return email.replace(
    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    (_, local: string, domain: string) => `${local[0]}***@${domain}`,
  );
}

/** Build GmailRefreshConfig from ConnectorAuth if refresh token and creds available. */
function buildRefreshConfig(auth: ConnectorAuth): GmailRefreshConfig | undefined {
  if (!auth.refreshToken) return undefined;
  const clientId = auth.params?.['clientId']
    ?? process.env['ODY_GOOGLE_CLIENT_ID'] ?? process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = auth.params?.['clientSecret']
    ?? process.env['ODY_GOOGLE_CLIENT_SECRET'] ?? process.env['GOOGLE_CLIENT_SECRET'];
  if (!clientId || !clientSecret) return undefined;
  return { refreshToken: auth.refreshToken, clientId, clientSecret };
}

/** Convert a Gmail message summary to a ConnectorDocument, or null if empty. */
function messageToDocument(
  msg: GmailMessageSummary,
  source?: ConnectorSource,
  redactPii = true,
): ConnectorDocument | null {
  const from = redactPii && msg.from ? redactEmail(msg.from) : msg.from;
  const to = redactPii && msg.to ? msg.to.map(redactEmail) : msg.to;

  const lines = [`# ${msg.subject}`, ''];
  if (from) lines.push(`**From:** ${from}`);
  if (to?.length) lines.push(`**To:** ${to.join(', ')}`);
  if (msg.date) lines.push(`**Date:** ${msg.date}`);
  lines.push('', msg.snippet);

  const content = lines.join('\n').trim();
  if (content.length < 20) return null;

  const parentChain = source
    ? [
      { type: 'label', name: source.name, id: source.id },
      { type: 'thread', name: msg.subject, id: msg.threadId },
    ]
    : [{ type: 'thread', name: msg.subject, id: msg.threadId }];

  return {
    id: `gmail:msg:${msg.threadId}:${msg.id}`,
    title: msg.subject,
    content,
    sourceType: 'gmail',
    sourceUrl: `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
    lastModified: msg.date ? new Date(msg.date) : undefined,
    author: from,
    metadata: {
      threadId: msg.threadId,
      messageId: msg.id,
      from: msg.from,
      to: msg.to,
      labelId: source?.id,
      labelName: source?.name,
      parentChain,
      analysisHints: { factDensity: 'low' as const, authoritative: false },
    },
  };
}
