/**
 * Connector registry for Ody Refine.
 * Provides a central registry of all available connectors.
 * @module connectors/index
 */
import type { RefineConnector } from './types.js';
import { NotionConnector } from './notion.js';
import { SlackConnector } from './slack.js';
import { LinearConnector } from './linear.js';
import { ConfluenceConnector } from './confluence.js';
import { JiraConnector } from './jira.js';
import { TeamsConnector } from './teams.js';
import { GmailConnector } from './gmail.js';
import { GoogleDriveConnector } from './google-drive.js';
import { GitHubConnector } from './github.js';

export type {
  RefineConnector,
  ConnectorDocument,
  ConnectorAuth,
  ConnectorSource,
  ConnectorProgress,
  WriteBackResult,
  SyncCursor,
  SyncCursorType,
  SyncChange,
  AuthMethod,
} from './types.js';

export {
  ConnectorAuthError,
  ConnectorError,
  ConnectorRateLimitError,
  ConnectorTokenExpiredError,
  ConnectorServerError,
  ConnectorEntityError,
} from './types.js';
export type { ParentRef, AnalysisHints } from './types.js';
export { withConnectorRetry } from './retry.js';
export type { RetryOptions } from './retry.js';
export { NotionConnector } from './notion.js';
export { SlackConnector } from './slack.js';
export { LinearConnector } from './linear.js';
export { ConfluenceConnector } from './confluence.js';
export { JiraConnector } from './jira.js';
export { TeamsConnector } from './teams.js';
export { GmailConnector } from './gmail.js';
export { GoogleDriveConnector } from './google-drive.js';
export { GitHubConnector } from './github.js';
export { runOAuthFlow, findFreePort } from './oauth-callback.js';
export type { OAuthFlowConfig, OAuthTokenResult } from './oauth-callback.js';
export { getOAuthConfig } from './oauth-configs.js';
export {
  storeCredential,
  getCredential,
  removeCredential,
} from './credential-store.js';
export type { StoredCredential } from './credential-store.js';
export {
  resolveConnectorToken,
  ENV_TOKEN_MAP,
  DEFAULT_AUTH_METHOD,
} from './resolve-credential.js';
export type { ResolvedToken } from './resolve-credential.js';
export {
  loadCursor,
  loadCursors,
  saveCursor,
  removeCursor,
} from './cursor-store.js';

/** Metadata about an available connector. */
export interface ConnectorInfo {
  /** Unique connector name. */
  name: string;
  /** Human-readable display name. */
  displayName: string;
  /** Whether write-back is supported. */
  supportsWriteBack: boolean;
  /** Supported auth methods. */
  authMethods: string[];
  /** Implementation status. */
  status: 'available' | 'stub' | 'planned';
}

/** Registry of all available connectors. */
const CONNECTOR_FACTORIES: Record<string, () => RefineConnector> = {
  notion: () => new NotionConnector(),
  slack: () => new SlackConnector(),
  linear: () => new LinearConnector(),
  confluence: () => new ConfluenceConnector(),
  jira: () => new JiraConnector(),
  teams: () => new TeamsConnector(),
  gmail: () => new GmailConnector(),
  'google-drive': () => new GoogleDriveConnector(),
  github: () => new GitHubConnector(),
};

/** Metadata for all connectors (including planned ones). */
const CONNECTOR_INFO: ConnectorInfo[] = [
  {
    name: 'notion',
    displayName: 'Notion',
    supportsWriteBack: true,
    authMethods: ['api-key', 'oauth'],
    status: 'available',
  },
  {
    name: 'slack',
    displayName: 'Slack',
    supportsWriteBack: true,
    authMethods: ['bot-token', 'oauth'],
    status: 'available',
  },
  {
    name: 'confluence',
    displayName: 'Confluence',
    supportsWriteBack: false,
    authMethods: ['api-key', 'oauth'],
    status: 'available',
  },
  {
    name: 'google-drive',
    displayName: 'Google Drive',
    supportsWriteBack: false,
    authMethods: ['oauth'],
    status: 'available',
  },
  {
    name: 'linear',
    displayName: 'Linear',
    supportsWriteBack: true,
    authMethods: ['api-key', 'oauth'],
    status: 'available',
  },
  {
    name: 'jira',
    displayName: 'Jira',
    supportsWriteBack: false,
    authMethods: ['api-key', 'oauth'],
    status: 'available',
  },
  {
    name: 'teams',
    displayName: 'Microsoft Teams',
    supportsWriteBack: false,
    authMethods: ['oauth'],
    status: 'available',
  },
  {
    name: 'gmail',
    displayName: 'Gmail',
    supportsWriteBack: false,
    authMethods: ['oauth'],
    status: 'available',
  },
  {
    name: 'github',
    displayName: 'GitHub',
    supportsWriteBack: false,
    authMethods: ['api-key', 'oauth'],
    status: 'available',
  },
];

/**
 * Get a connector instance by name.
 * @throws {Error} if connector is not available
 */
export function getConnector(name: string): RefineConnector {
  const factory = CONNECTOR_FACTORIES[name];
  if (!factory) {
    const info = CONNECTOR_INFO.find((c) => c.name === name);
    if (info?.status === 'planned') {
      throw new Error(
        `Connector '${name}' is planned but not yet implemented. ` +
        `See: https://github.com/ufukkaraca/ody-platform/issues`,
      );
    }
    throw new Error(
      `Unknown connector '${name}'. Available: ${listConnectors().map((c) => c.name).join(', ')}`,
    );
  }
  return factory();
}

/** List all known connectors with their status. */
export function listConnectors(): ConnectorInfo[] {
  return [...CONNECTOR_INFO];
}

/** List only connectors that are available (have implementations). */
export function listAvailableConnectors(): ConnectorInfo[] {
  return CONNECTOR_INFO.filter((c) => c.status !== 'planned');
}

/**
 * Check if a connector exists by name.
 * Returns true for both implemented and planned connectors.
 */
export function hasConnector(name: string): boolean {
  return CONNECTOR_INFO.some((c) => c.name === name);
}
