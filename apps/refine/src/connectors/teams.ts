/**
 * Microsoft Teams connector for Ody Refine.
 * Reads Teams channels/messages via the Microsoft Graph API.
 * Converts messages to markdown-normalized ConnectorDocuments.
 * Auth: OAuth bearer token (requires Microsoft Graph permissions).
 * @module connectors/teams
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
import { TeamsApiClient } from './teams-api.js';
import type { TeamsMessage } from './teams-api.js';

/**
 * Teams connector — reads teams, channels, and messages.
 *
 * Auth: oauth (Bearer token with Microsoft Graph permissions).
 * Env fallback: TEAMS_ACCESS_TOKEN.
 *
 * Sources: each team is a ConnectorSource.
 * Documents: channel messages grouped by channel, converted to markdown.
 */
export class TeamsConnector implements RefineConnector {
  readonly name = 'teams';
  readonly displayName = 'Microsoft Teams';
  readonly authMethods: AuthMethod[] = ['oauth'];
  readonly supportsWriteBack = false;

  private client: TeamsApiClient | null = null;

  /** @inheritdoc */
  async authenticate(auth: ConnectorAuth): Promise<void> {
    const token = auth.token || process.env['TEAMS_ACCESS_TOKEN'];
    if (!token) {
      throw new ConnectorAuthError(
        'teams',
        'Access token is required. Set TEAMS_ACCESS_TOKEN or pass auth.token.',
      );
    }
    const client = new TeamsApiClient(token);
    const valid = await client.validateToken();
    if (!valid) {
      throw new ConnectorAuthError(
        'teams', 'Invalid token or insufficient permissions',
      );
    }
    this.client = client;
  }

  /** @inheritdoc */
  async listSources(): Promise<ConnectorSource[]> {
    const client = this.ensureClient();
    const teams = await client.fetchTeams();
    return teams.map((t) => ({
      id: t.id,
      name: t.displayName,
      type: 'team',
    }));
  }

  /** @inheritdoc */
  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.ensureClient();
    let current = 0;
    const total = sources.length;

    for (const source of sources) {
      onProgress?.({
        phase: 'fetch', current, total,
        message: `Fetching channels for: ${source.name}`,
      });

      const channels = await client.fetchChannels(source.id);
      for (const channel of channels) {
        const { messages } = await client.fetchChannelMessages(
          source.id, channel.id,
        );
        for (const msg of messages) {
          const doc = messageToDocument(source.id, source.name, channel, msg);
          if (doc) {
            current++;
            onProgress?.({
              phase: 'fetch', current, total: 0, message: channel.displayName,
            });
            yield doc;
          }
        }
      }
    }
    onProgress?.({ phase: 'fetch', current, total: current });
  }

  /** @inheritdoc */
  getInitialCursor(): SyncCursor {
    return {
      type: 'timestamp',
      value: new Date().toISOString(),
      connectorName: 'teams',
      updatedAt: new Date().toISOString(),
    };
  }

  /** @inheritdoc */
  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    const client = this.ensureClient();
    const since = cursor ? new Date(cursor.value) : undefined;
    const teams = await client.fetchTeams();

    for (const team of teams) {
      const channels = await client.fetchChannels(team.id);
      for (const channel of channels) {
        const { messages } = await client.fetchChannelMessages(
          team.id, channel.id,
        );
        for (const msg of messages) {
          if (since && new Date(msg.createdDateTime) <= since) continue;
          const doc = messageToDocument(
            team.id, team.displayName, channel, msg,
          );
          if (doc) yield { document: doc, action: 'upsert' };
        }
      }
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
      error: 'Write-back is not yet implemented for Teams.',
    };
  }

  /** @inheritdoc */
  async validate(): Promise<boolean> {
    if (!this.client) return false;
    return this.client.validateToken();
  }

  /** Guard: throw if not authenticated. */
  private ensureClient(): TeamsApiClient {
    if (!this.client) {
      throw new ConnectorAuthError(
        'teams', 'Not authenticated. Call authenticate() first.',
      );
    }
    return this.client;
  }
}

// --- Helpers ---

/** Convert a Teams message to a ConnectorDocument or null if too short. */
function messageToDocument(
  teamId: string,
  teamName: string,
  channel: { id: string; displayName: string },
  msg: TeamsMessage,
): ConnectorDocument | null {
  const author = msg.from?.user?.displayName ?? 'Unknown';
  const content = [
    `# Message in ${teamName} / #${channel.displayName}`,
    '',
    `**From:** ${author}`,
    `**Date:** ${msg.createdDateTime}`,
    '',
    msg.body.content,
  ].join('\n').trim();

  if (content.length < 20) return null;

  return {
    id: `teams:msg:${teamId}:${channel.id}:${msg.id}`,
    title: `${teamName} / #${channel.displayName} — ${author}`,
    content,
    sourceType: 'teams',
    sourceUrl: msg.webUrl,
    lastModified: new Date(msg.createdDateTime),
    author,
    metadata: {
      teamId,
      teamName,
      channelId: channel.id,
      channelName: channel.displayName,
      messageId: msg.id,
      parentChain: [
        { type: 'team', name: teamName, id: teamId },
        { type: 'channel', name: channel.displayName, id: channel.id },
      ],
      analysisHints: { factDensity: 'low' as const, authoritative: false },
    },
  };
}
