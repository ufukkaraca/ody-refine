/**
 * OAuth callback server — localhost HTTP server for OAuth authorization code flow.
 * Opens the browser, waits for Notion to redirect back, exchanges code for token.
 * Ported from ody/colleague OAuth flow, adapted for CLI use.
 * @module connectors/oauth-callback
 */
import { createServer } from 'node:http';
import { URL } from 'node:url';
import crypto from 'node:crypto';

/** Configuration for an OAuth authorization code flow. */
export interface OAuthFlowConfig {
  /** Provider display name (e.g. "Notion"). */
  provider: string;
  /** OAuth authorization URL (e.g. https://api.notion.com/v1/oauth/authorize). */
  authorizationUrl: string;
  /** OAuth token exchange URL (e.g. https://api.notion.com/v1/oauth/token). */
  tokenUrl: string;
  /** OAuth client ID. */
  clientId: string;
  /** OAuth client secret. */
  clientSecret: string;
  /** Additional query params for the authorization URL. */
  extraAuthParams?: Record<string, string>;
  /** Whether to use HTTP Basic Auth for token exchange (Notion requires this). */
  useBasicAuth?: boolean;
  /** Timeout in ms for the user to complete the flow. Default: 120000 (2 min). */
  timeoutMs?: number;
  /** Function to open a URL in the browser. Default: dynamic import of 'open'. */
  openBrowser?: (url: string) => Promise<void>;
  /** Fixed port to listen on (must match provider's registered redirect URI). */
  preferredPort?: number;
  /** Callback path (e.g. "/api/integrations/notion/callback"). Default: "/callback". */
  callbackPath?: string;
}

/** Result of a successful OAuth token exchange. */
export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  workspaceId?: string;
  workspaceName?: string;
  botId?: string;
  expiresIn?: number;
  raw: Record<string, unknown>;
}

/** HTML page shown in the browser after successful auth. */
const SUCCESS_HTML = `<!DOCTYPE html><html><head><title>Connected</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;
align-items:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{text-align:center;padding:2rem;border-radius:12px;background:#fff;
box-shadow:0 2px 8px rgba(0,0,0,.1)}h1{color:#22c55e;margin:0 0 .5rem}
p{color:#6b7280}</style></head><body><div class="card">
<h1>Connected!</h1><p>You can close this tab and return to your terminal.</p>
</div></body></html>`;

/** HTML page shown on error. */
function errorHtml(msg: string): string {
  return `<!DOCTYPE html><html><head><title>Error</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;
align-items:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{text-align:center;padding:2rem;border-radius:12px;background:#fff;
box-shadow:0 2px 8px rgba(0,0,0,.1)}h1{color:#ef4444;margin:0 0 .5rem}
p{color:#6b7280}</style></head><body><div class="card">
<h1>Connection failed</h1><p>${msg}</p>
</div></body></html>`;
}

/**
 * Find a free port by binding to port 0 and reading the assigned port.
 * Tries the preferred port first, falls back to random.
 */
export async function findFreePort(preferred = 9876): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(preferred, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : preferred;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => {
      // Preferred port busy — use port 0 for random assignment
      const fallback = createServer();
      fallback.listen(0, '127.0.0.1', () => {
        const addr = fallback.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        fallback.close(() => {
          if (port === 0) reject(new Error('Could not find a free port'));
          else resolve(port);
        });
      });
      fallback.on('error', reject);
    });
  });
}

/**
 * Run a full OAuth authorization code flow via a localhost callback server.
 *
 * 1. Start HTTP server on a free port
 * 2. Open browser to the provider's authorization URL
 * 3. Wait for redirect with ?code=xxx
 * 4. Exchange code for access token
 * 5. Shut down the server
 */
export async function runOAuthFlow(
  config: OAuthFlowConfig,
): Promise<OAuthTokenResult> {
  const timeout = config.timeoutMs ?? 120_000;
  const state = crypto.randomUUID();

  return new Promise<OAuthTokenResult>((resolve, reject) => {
    let settled = false;

    function settle(
      action: 'resolve' | 'reject',
      value: OAuthTokenResult | Error,
    ): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Close server after response is flushed
      setImmediate(() => server.close());
      if (action === 'resolve') resolve(value as OAuthTokenResult);
      else reject(value);
    }

    const timer = setTimeout(() => {
      settle('reject', new Error(
        `OAuth flow timed out after ${timeout / 1000}s. ` +
        'Please try again and complete the authorization in your browser.',
      ));
    }, timeout);

    const server = createServer(async (req, res) => {
      if (settled) { res.end(); return; }

      const actualPort = (server.address() as { port: number }).port;
      const reqUrl = new URL(
        req.url ?? '/', `http://localhost:${actualPort}`,
      );

      const expectedPath = config.callbackPath ?? '/callback';
      if (reqUrl.pathname !== expectedPath) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = reqUrl.searchParams.get('code');
      const returnedState = reqUrl.searchParams.get('state');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        const desc = reqUrl.searchParams.get('error_description') ?? error;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorHtml(desc));
        settle('reject', new Error(`OAuth error: ${desc}`));
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorHtml(
          'Invalid callback — missing code or state mismatch.',
        ));
        settle('reject', new Error(
          'OAuth callback: missing code or state mismatch',
        ));
        return;
      }

      // Exchange code for token
      const cbPath = config.callbackPath ?? '/callback';
      const redirectUri = `http://localhost:${actualPort}${cbPath}`;
      try {
        const tokenResult = await exchangeCodeForToken(
          config, code, redirectUri,
        );
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SUCCESS_HTML);
        settle('resolve', tokenResult);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorHtml(msg));
        settle('reject', err instanceof Error ? err : new Error(msg));
      }
    });

    // Listen on preferred port (for matching provider's registered redirect URI)
    const listenPort = config.preferredPort ?? 0;
    server.listen(listenPort, '127.0.0.1', async () => {
      const actualPort = (server.address() as { port: number }).port;
      const cbPath = config.callbackPath ?? '/callback';
      const redirectUri = `http://localhost:${actualPort}${cbPath}`;

      // Build authorization URL with the actual port
      const authUrl = new URL(config.authorizationUrl);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('state', state);
      if (config.extraAuthParams) {
        for (const [k, v] of Object.entries(config.extraAuthParams)) {
          authUrl.searchParams.set(k, v);
        }
      }

      const openFn = config.openBrowser ?? defaultOpenBrowser;
      try {
        await openFn(authUrl.toString());
      } catch {
        process.stderr.write(
          `\nCould not open browser automatically.\n` +
          `Please visit this URL to authorize:\n` +
          `  ${authUrl.toString()}\n\n` +
          `Waiting for authorization... (press Ctrl+C to cancel)\n`,
        );
      }
    });
  });
}

/** Exchange an authorization code for an access token. */
async function exchangeCodeForToken(
  config: OAuthFlowConfig,
  code: string,
  redirectUri: string,
): Promise<OAuthTokenResult> {
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  };

  const headers: Record<string, string> = {};

  if (config.useBasicAuth) {
    // Notion uses Basic Auth with JSON body
    const credentials = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
    headers['Content-Type'] = 'application/json';
  } else {
    // OAuth 2.0 spec (RFC 6749 §4.1.3): use form-encoded body
    body['client_id'] = config.clientId;
    body['client_secret'] = config.clientSecret;
  }

  const useJson = !!config.useBasicAuth;
  const encodedBody = useJson
    ? JSON.stringify(body)
    : new URLSearchParams(body).toString();
  if (!useJson) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: encodedBody,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error');
    throw new Error(
      `Token exchange failed (${response.status}): ${text}`,
    );
  }

  const data = await response.json() as Record<string, unknown>;
  const accessToken = data.access_token as string | undefined;

  if (!accessToken) {
    throw new Error('Token exchange response missing access_token');
  }

  return {
    accessToken,
    refreshToken: data.refresh_token as string | undefined,
    workspaceId: data.workspace_id as string | undefined,
    workspaceName: data.workspace_name as string | undefined,
    botId: data.bot_id as string | undefined,
    expiresIn: data.expires_in as number | undefined,
    raw: data,
  };
}

/** Default browser opener using the 'open' package. */
async function defaultOpenBrowser(url: string): Promise<void> {
  const open = (await import('open')).default;
  await open(url);
}
