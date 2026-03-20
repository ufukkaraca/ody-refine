/**
 * OAuth provider configurations for all connectors.
 * Each config maps a connector name to its OAuth authorize + token URLs.
 * Client IDs and secrets come from env vars.
 * @module connectors/oauth-configs
 */
import type { OAuthFlowConfig } from './oauth-callback.js';

/** Env-var lookup with ODY_ prefix fallback. */
function env(primary: string, fallback?: string): string | undefined {
  return process.env[`ODY_${primary}`]
    ?? process.env[primary]
    ?? (fallback ? process.env[fallback] : undefined);
}

// ---------------------------------------------------------------------------
// Atlassian shared scopes (Confluence + Jira)
// ---------------------------------------------------------------------------

const ATLASSIAN_SCOPES = [
  'read:confluence-space.summary',
  'read:confluence-content.all',
  'read:jira-work',
  'read:jira-user',
  'offline_access',
].join(' ');

// ---------------------------------------------------------------------------
// Per-provider configs
// ---------------------------------------------------------------------------

/** Build OAuth config for a given connector name, or null if creds missing. */
export function getOAuthConfig(source: string): OAuthFlowConfig | null {
  switch (source) {
    case 'notion':
      return notionOAuthConfig();
    case 'linear':
      return linearOAuthConfig();
    case 'slack':
      return slackOAuthConfig();
    case 'confluence':
    case 'jira':
      return atlassianOAuthConfig(source);
    case 'gmail':
      return gmailOAuthConfig();
    case 'teams':
      return teamsOAuthConfig();
    case 'google-drive':
      return googleDriveOAuthConfig();
    case 'github':
      return githubOAuthConfig();
    default:
      return null;
  }
}

/** Notion: Basic-auth token exchange. */
function notionOAuthConfig(): OAuthFlowConfig | null {
  const clientId = env('NOTION_CLIENT_ID');
  const clientSecret = env('NOTION_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    provider: 'Notion',
    authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientId,
    clientSecret,
    useBasicAuth: true,
    extraAuthParams: { owner: 'user' },
    preferredPort: 3000,
    callbackPath: '/api/integrations/notion/callback',
  };
}

/** Linear: standard code flow. */
function linearOAuthConfig(): OAuthFlowConfig | null {
  const clientId = env('LINEAR_CLIENT_ID');
  const clientSecret = env('LINEAR_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    provider: 'Linear',
    authorizationUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    clientId,
    clientSecret,
    extraAuthParams: { scope: 'read write' },
    preferredPort: 3000,
    callbackPath: '/api/integrations/linear/callback',
  };
}

/** Slack: bot token via OAuth. */
function slackOAuthConfig(): OAuthFlowConfig | null {
  const clientId = env('SLACK_CLIENT_ID');
  const clientSecret = env('SLACK_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    provider: 'Slack',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientId,
    clientSecret,
    extraAuthParams: {
      scope: 'channels:history,channels:read,chat:write,users:read',
    },
  };
}

/** Atlassian (Confluence / Jira): shared OAuth with cloudId. */
function atlassianOAuthConfig(
  source: 'confluence' | 'jira',
): OAuthFlowConfig | null {
  const clientId = env('ATLASSIAN_CLIENT_ID');
  const clientSecret = env('ATLASSIAN_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    provider: source === 'confluence' ? 'Confluence' : 'Jira',
    authorizationUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    clientId,
    clientSecret,
    extraAuthParams: {
      audience: 'api.atlassian.com',
      scope: ATLASSIAN_SCOPES,
      prompt: 'consent',
    },
  };
}

/** Gmail: Google OAuth2. */
function gmailOAuthConfig(): OAuthFlowConfig | null {
  const clientId = env('GOOGLE_CLIENT_ID');
  const clientSecret = env('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    provider: 'Gmail',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId,
    clientSecret,
    extraAuthParams: {
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
    },
    preferredPort: 3000,
    callbackPath: '/api/integrations/gmail/callback',
  };
}

/** Microsoft Teams: Microsoft identity platform v2.0. */
function teamsOAuthConfig(): OAuthFlowConfig | null {
  const clientId = env('MICROSOFT_CLIENT_ID');
  const clientSecret = env('MICROSOFT_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    provider: 'Microsoft Teams',
    authorizationUrl:
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl:
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId,
    clientSecret,
    extraAuthParams: {
      scope: [
        'Team.ReadBasic.All',
        'Channel.ReadBasic.All',
        'ChannelMessage.Read.All',
        'offline_access',
      ].join(' '),
    },
    preferredPort: 3000,
    callbackPath: '/api/integrations/teams/callback',
  };
}

/** Google Drive: Google OAuth2 with Drive + Docs scopes. */
function googleDriveOAuthConfig(): OAuthFlowConfig | null {
  const clientId = env('GOOGLE_CLIENT_ID');
  const clientSecret = env('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    provider: 'Google Drive',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId,
    clientSecret,
    extraAuthParams: {
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
    },
    preferredPort: 3000,
    callbackPath: '/api/integrations/google-drive/callback',
  };
}

/** GitHub: GitHub OAuth App. */
function githubOAuthConfig(): OAuthFlowConfig | null {
  const clientId = env('GITHUB_CLIENT_ID');
  const clientSecret = env('GITHUB_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    provider: 'GitHub',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientId,
    clientSecret,
    extraAuthParams: { scope: 'repo read:org read:discussion' },
    preferredPort: 3000,
    callbackPath: '/api/integrations/github/callback',
  };
}
