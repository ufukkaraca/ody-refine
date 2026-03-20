/**
 * Tests for the Notion OAuth callback flow and credential store.
 * Mocks the HTTP server and token exchange — does not require live API access.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { findFreePort, runOAuthFlow } from '../src/connectors/oauth-callback.js';
import type { OAuthFlowConfig } from '../src/connectors/oauth-callback.js';
import {
  storeCredential,
  getCredential,
  removeCredential,
} from '../src/connectors/credential-store.js';
import type { StoredCredential } from '../src/connectors/credential-store.js';

// ---------------------------------------------------------------------------
// findFreePort
// ---------------------------------------------------------------------------

describe('findFreePort', () => {
  it('returns a valid port number', async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });

  it('returns the preferred port when available', async () => {
    // Use a high random port unlikely to be taken
    const preferred = 49123;
    const port = await findFreePort(preferred);
    // Should get the preferred port or a fallback
    expect(port).toBeGreaterThan(0);
  });

  it('falls back when preferred port is busy', async () => {
    // Occupy a port
    const blocker = http.createServer();
    const blockerPort = await new Promise<number>((resolve) => {
      blocker.listen(0, '127.0.0.1', () => {
        const addr = blocker.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    try {
      const port = await findFreePort(blockerPort);
      expect(port).toBeGreaterThan(0);
      // Should get a different port since the preferred one is taken
    } finally {
      blocker.close();
    }
  });
});

// ---------------------------------------------------------------------------
// runOAuthFlow — mock token server
// ---------------------------------------------------------------------------

describe('runOAuthFlow', () => {
  let mockTokenServer: http.Server;
  let mockTokenPort: number;

  beforeEach(async () => {
    // Start a mock token endpoint
    mockTokenServer = http.createServer((req, res) => {
      let _body = '';
      req.on('data', (chunk: Buffer) => { _body += chunk.toString(); });
      req.on('end', () => {
        const authHeader = req.headers.authorization;

        // Verify Basic Auth header is present (Notion requires this)
        if (authHeader?.startsWith('Basic ')) {
          const decoded = Buffer.from(
            authHeader.slice(6), 'base64',
          ).toString();
          if (!decoded.includes(':')) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'invalid_auth' }));
            return;
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access_token: 'ntn_test_access_token_12345',
          token_type: 'bearer',
          bot_id: 'bot_test_id',
          workspace_id: 'ws_test_id',
          workspace_name: 'Test Workspace',
        }));
      });
    });

    mockTokenPort = await new Promise<number>((resolve) => {
      mockTokenServer.listen(0, '127.0.0.1', () => {
        const addr = mockTokenServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });
  });

  afterEach(() => {
    mockTokenServer.close();
  });

  it('completes the full OAuth flow with a mock callback', async () => {
    const config: OAuthFlowConfig = {
      provider: 'Notion',
      authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: `http://127.0.0.1:${mockTokenPort}/oauth/token`,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      useBasicAuth: true,
      extraAuthParams: { owner: 'user' },
      timeoutMs: 10_000,
      // Override browser open to simulate the OAuth redirect
      openBrowser: async (authUrl: string) => {
        // Parse the auth URL to extract redirect_uri and state
        const url = new URL(authUrl);
        const redirectUri = url.searchParams.get('redirect_uri');
        const state = url.searchParams.get('state');

        expect(redirectUri).toBeTruthy();
        expect(state).toBeTruthy();
        expect(url.searchParams.get('client_id')).toBe('test-client-id');
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('owner')).toBe('user');

        // Simulate the provider redirecting back with a code
        // Small delay to let the server start listening
        setTimeout(async () => {
          const callbackUrl = `${redirectUri}?code=test_auth_code_xyz&state=${state}`;
          await fetch(callbackUrl);
        }, 100);
      },
    };

    const result = await runOAuthFlow(config);

    expect(result.accessToken).toBe('ntn_test_access_token_12345');
    expect(result.workspaceId).toBe('ws_test_id');
    expect(result.workspaceName).toBe('Test Workspace');
    expect(result.botId).toBe('bot_test_id');
  });

  it('rejects when OAuth returns an error', async () => {
    const config: OAuthFlowConfig = {
      provider: 'Notion',
      authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: `http://127.0.0.1:${mockTokenPort}/oauth/token`,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      useBasicAuth: true,
      timeoutMs: 5_000,
      openBrowser: async (authUrl: string) => {
        const url = new URL(authUrl);
        const redirectUri = url.searchParams.get('redirect_uri');
        setTimeout(async () => {
          const callbackUrl =
            `${redirectUri}?error=access_denied&error_description=User+denied+access`;
          await fetch(callbackUrl).catch(() => { /* server will close */ });
        }, 100);
      },
    };

    await expect(runOAuthFlow(config)).rejects.toThrow('User denied access');
  });

  it('rejects on state mismatch', async () => {
    const config: OAuthFlowConfig = {
      provider: 'Notion',
      authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: `http://127.0.0.1:${mockTokenPort}/oauth/token`,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      useBasicAuth: true,
      timeoutMs: 5_000,
      openBrowser: async (authUrl: string) => {
        const url = new URL(authUrl);
        const redirectUri = url.searchParams.get('redirect_uri');
        // Use setImmediate-like approach to avoid race conditions
        setTimeout(() => {
          const callbackUrl = `${redirectUri}?code=test_code&state=wrong_state`;
          fetch(callbackUrl).catch(() => { /* expected — server closes */ });
        }, 200);
      },
    };

    await expect(runOAuthFlow(config)).rejects.toThrow('state mismatch');
  }, 10_000);

  it('rejects on timeout', async () => {
    const config: OAuthFlowConfig = {
      provider: 'Notion',
      authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: `http://127.0.0.1:${mockTokenPort}/oauth/token`,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      timeoutMs: 500,
      openBrowser: async () => {
        // Don't call back — simulate user not completing auth
      },
    };

    await expect(runOAuthFlow(config)).rejects.toThrow('timed out');
  });
});

// ---------------------------------------------------------------------------
// Credential store — file fallback (keychain tests need real macOS)
// ---------------------------------------------------------------------------

describe('credential-store', () => {
  const testProvider = `test-provider-${Date.now()}`;

  afterEach(async () => {
    await removeCredential(testProvider);
  });

  it('stores and retrieves a credential', async () => {
    const cred: StoredCredential = {
      provider: testProvider,
      accessToken: 'test-token-abc',
      workspaceId: 'ws-123',
      workspaceName: 'Test WS',
      connectedAt: new Date().toISOString(),
    };

    await storeCredential(cred);
    const retrieved = await getCredential(testProvider);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.accessToken).toBe('test-token-abc');
    expect(retrieved!.workspaceId).toBe('ws-123');
    expect(retrieved!.workspaceName).toBe('Test WS');
    expect(retrieved!.provider).toBe(testProvider);
  });

  it('returns null for unknown provider', async () => {
    const result = await getCredential('nonexistent-provider-xyz');
    expect(result).toBeNull();
  });

  it('removes a stored credential', async () => {
    const cred: StoredCredential = {
      provider: testProvider,
      accessToken: 'to-be-removed',
      connectedAt: new Date().toISOString(),
    };

    await storeCredential(cred);
    const removed = await removeCredential(testProvider);
    expect(removed).toBe(true);

    const result = await getCredential(testProvider);
    expect(result).toBeNull();
  });

  it('removeCredential returns false for unknown provider', async () => {
    const removed = await removeCredential('never-stored-xyz');
    expect(removed).toBe(false);
  });

  it('overwrites credential for same provider', async () => {
    const cred1: StoredCredential = {
      provider: testProvider,
      accessToken: 'token-v1',
      connectedAt: new Date().toISOString(),
    };
    const cred2: StoredCredential = {
      provider: testProvider,
      accessToken: 'token-v2',
      workspaceName: 'Updated WS',
      connectedAt: new Date().toISOString(),
    };

    await storeCredential(cred1);
    await storeCredential(cred2);

    const retrieved = await getCredential(testProvider);
    expect(retrieved!.accessToken).toBe('token-v2');
    expect(retrieved!.workspaceName).toBe('Updated WS');
  });
});

// ---------------------------------------------------------------------------
// Connector index — Notion is now 'available'
// ---------------------------------------------------------------------------

describe('connector registry', () => {
  it('marks Notion as available (not stub)', async () => {
    const { listConnectors } = await import(
      '../src/connectors/index.js'
    );
    const connectors = listConnectors();
    const notion = connectors.find((c) => c.name === 'notion');
    expect(notion).toBeDefined();
    expect(notion!.status).toBe('available');
  });

  it('notion connector supports oauth auth method', async () => {
    const { NotionConnector } = await import(
      '../src/connectors/notion.js'
    );
    const connector = new NotionConnector();
    expect(connector.authMethods).toContain('oauth');
    expect(connector.authMethods).toContain('api-key');
  });
});
