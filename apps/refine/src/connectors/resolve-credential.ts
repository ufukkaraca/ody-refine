/**
 * Generic credential resolution for connectors.
 * Checks: explicit token → credential store (keychain) → env var.
 * @module connectors/resolve-credential
 */
import { getCredential } from './credential-store.js';
import type { AuthMethod } from './types.js';

/** Map connector names to env-var fallback for API-key/bot-token auth. */
export const ENV_TOKEN_MAP: Record<string, string> = {
  slack: 'SLACK_BOT_TOKEN',
  notion: 'NOTION_TOKEN',
  confluence: 'CONFLUENCE_API_TOKEN',
  linear: 'LINEAR_API_KEY',
  jira: 'JIRA_API_TOKEN',
  gmail: 'GMAIL_ACCESS_TOKEN',
  teams: 'TEAMS_ACCESS_TOKEN',
  'google-drive': 'GOOGLE_DRIVE_ACCESS_TOKEN',
  github: 'GITHUB_TOKEN',
};

/** Map connector names to their default auth method for token-based use. */
export const DEFAULT_AUTH_METHOD: Record<string, AuthMethod> = {
  slack: 'bot-token',
  notion: 'oauth',
  linear: 'api-key',
  confluence: 'api-key',
  jira: 'api-key',
  gmail: 'oauth',
  teams: 'oauth',
  'google-drive': 'oauth',
  github: 'api-key',
};

/** Result of resolving a connector token. */
export interface ResolvedToken {
  token: string;
  method: AuthMethod;
  source: 'explicit' | 'stored' | 'env';
}

/**
 * Resolve a connector token through the standard chain:
 * 1. Explicit token (CLI flag)
 * 2. Stored credential (keychain / credential file)
 * 3. Environment variable
 *
 * Returns null if no token is found from any source.
 */
export async function resolveConnectorToken(
  connectorName: string,
  explicitToken?: string,
): Promise<ResolvedToken | null> {
  // 1. Explicit token takes priority
  if (explicitToken) {
    const method = DEFAULT_AUTH_METHOD[connectorName] ?? 'api-key';
    return { token: explicitToken, method, source: 'explicit' };
  }

  // 2. Check credential store (keychain on macOS, file fallback)
  const stored = await getCredential(connectorName);
  if (stored) {
    return { token: stored.accessToken, method: 'oauth', source: 'stored' };
  }

  // 3. Fall back to environment variable
  const envVar = ENV_TOKEN_MAP[connectorName];
  const envToken = envVar ? process.env[envVar] : undefined;
  if (envToken) {
    const method = DEFAULT_AUTH_METHOD[connectorName] ?? 'api-key';
    return { token: envToken, method, source: 'env' };
  }

  return null;
}

/** Private IP regex for SSRF check. */
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

/**
 * Validate a connector base URL to prevent SSRF attacks.
 * Rejects localhost, loopback, and private IP addresses.
 */
export function validateConnectorUrl(url: string): void {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    throw new Error(`Connector URL must not point to localhost: ${url}`);
  }
  if (PRIVATE_IP_RE.test(host)) {
    throw new Error(`Connector URL must not point to private IP range: ${url}`);
  }
}
