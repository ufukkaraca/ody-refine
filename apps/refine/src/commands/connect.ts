/**
 * Connect command — authenticate and test connector connections.
 * `ody-refine connect notion` — runs OAuth flow, stores token in keychain.
 * `ody-refine connect slack --token xoxb-...` — tests with explicit token.
 * `ody-refine connect list` — shows available connectors and their status.
 * @module commands/connect
 */
import { Command } from 'commander';
import {
  getConnector,
  listConnectors,
} from '../connectors/index.js';
import { createSpinner } from '../output/index.js';
import { runOAuthFlow } from '../connectors/oauth-callback.js';
import {
  storeCredential,
  getCredential,
} from '../connectors/credential-store.js';
import { getOAuthConfig } from '../connectors/oauth-configs.js';
import {
  ENV_TOKEN_MAP,
  DEFAULT_AUTH_METHOD,
} from '../connectors/resolve-credential.js';

/** Create the connect command. */
export function createConnectCommand(): Command {
  const cmd = new Command('connect')
    .description('Connect to a data source (Slack, Notion, Linear, etc.)')
    .argument('[source]', 'Connector name (e.g. slack, notion, linear)')
    .option('--token <token>', 'Auth token (or set via env var)')
    .option('--list', 'List available connectors with status')
    .addHelpText('after', `
Examples:
  $ ody-refine connect list                  List connectors with status
  $ ody-refine connect notion                Connect via OAuth (opens browser)
  $ ody-refine connect linear                Connect Linear via OAuth
  $ ody-refine connect slack                 Connect Slack via OAuth
  $ ody-refine connect notion --token ntn_...  Connect with explicit token
  $ ody-refine connect slack --token xoxb-...  Test Slack connection
`)
    .action(async (
      source: string | undefined,
      opts: { token?: string; list?: boolean },
    ) => {
      if (opts.list || !source || source === 'list') {
        await printConnectorList();
        return;
      }
      await connectSource(source, opts.token);
    });

  return cmd;
}

/** Print connectors with stored-credential status. */
async function printConnectorList(): Promise<void> {
  const connectors = listConnectors();
  process.stdout.write('\nAvailable connectors:\n\n');

  for (const c of connectors) {
    const stored = await getCredential(c.name);
    const connected = stored ? '[connected]' : '';
    const statusIcon = c.status === 'available' ? '[ready]'
      : c.status === 'stub' ? '[stub]'
        : '[planned]';
    const wb = c.supportsWriteBack ? 'write-back' : 'read-only';
    const hasOAuth = getOAuthConfig(c.name) !== null;
    const authHint = hasOAuth ? 'oauth' : `env: ${ENV_TOKEN_MAP[c.name] ?? 'N/A'}`;
    process.stdout.write(
      `  ${c.displayName.padEnd(18)} ${statusIcon.padEnd(10)} ` +
      `${wb.padEnd(12)} ${authHint.padEnd(16)} ${connected}\n`,
    );
  }
  process.stdout.write('\n');
}

/** Connect to a source — stored cred > OAuth > env var. */
async function connectSource(
  source: string,
  explicitToken?: string,
): Promise<void> {
  const spinner = createSpinner(`Connecting to ${source}...`);

  // Validate connector name
  const known = listConnectors().map((c) => c.name);
  if (!known.includes(source)) {
    spinner.fail(
      `Unknown connector "${source}". Available: ${known.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  if (explicitToken) {
    await testConnection(source, explicitToken, spinner);
    return;
  }

  // Check for a stored credential from a previous OAuth flow
  const stored = await getCredential(source);
  if (stored) {
    spinner.start(`Found stored ${source} credential, validating...`);
    try {
      const connector = getConnector(source);
      await connector.authenticate({
        method: 'oauth',
        token: stored.accessToken,
      });
      const valid = await connector.validate();
      if (valid) {
        spinner.succeed(
          `Connected to ${connector.displayName}` +
          (stored.workspaceName ? ` (${stored.workspaceName})` : ''),
        );
        await listSourceSummary(connector, spinner);
        return;
      }
    } catch {
      // Stored credential invalid — try OAuth or env var
    }
    spinner.info('Stored credential expired, re-authenticating...');
  }

  // Try OAuth flow if config is available
  const oauthConfig = getOAuthConfig(source);
  if (oauthConfig) {
    await connectWithOAuth(source, oauthConfig, spinner);
    return;
  }

  // Fall back to env var token
  const envVar = ENV_TOKEN_MAP[source];
  const envToken = envVar ? process.env[envVar] : undefined;
  if (envToken) {
    await testConnection(source, envToken, spinner);
    return;
  }

  spinner.fail(
    `No token provided. ` +
    `Set ${envVar ?? source.toUpperCase() + '_TOKEN'} or ` +
    `configure OAuth client credentials (see docs).`,
  );
  process.exitCode = 1;
}

/** Run the OAuth flow, store credential, and test connection. */
async function connectWithOAuth(
  source: string,
  oauthConfig: import('../connectors/oauth-callback.js').OAuthFlowConfig,
  spinner: ReturnType<typeof createSpinner>,
): Promise<void> {
  spinner.start(`Opening browser to connect ${oauthConfig.provider}...`);
  spinner.stop();

  process.stdout.write(
    `\nOpening browser to authorize Ody with ` +
    `your ${oauthConfig.provider} account...\n`,
  );

  try {
    const tokenResult = await runOAuthFlow(oauthConfig);

    await storeCredential({
      provider: source,
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      workspaceId: tokenResult.workspaceId,
      workspaceName: tokenResult.workspaceName,
      expiresAt: tokenResult.expiresIn
        ? Date.now() + tokenResult.expiresIn * 1000
        : undefined,
      connectedAt: new Date().toISOString(),
    });

    spinner.start('Validating connection...');
    const connector = getConnector(source);
    await connector.authenticate({
      method: 'oauth',
      token: tokenResult.accessToken,
    });

    spinner.succeed(
      `Connected to ${connector.displayName}` +
      (tokenResult.workspaceName ? ` (${tokenResult.workspaceName})` : ''),
    );
    await listSourceSummary(connector, spinner);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    spinner.fail(`OAuth connection failed: ${msg}`);
    process.exitCode = 1;
  }
}

/** Test a connector connection with an explicit token. */
async function testConnection(
  source: string,
  token: string,
  spinner: ReturnType<typeof createSpinner>,
): Promise<void> {
  spinner.start(`Connecting to ${source}...`);
  try {
    const connector = getConnector(source);
    const method = DEFAULT_AUTH_METHOD[source] ?? 'api-key';
    await connector.authenticate({ method, token });
    spinner.succeed(`Authenticated with ${connector.displayName}`);
    await listSourceSummary(connector, spinner);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    spinner.fail(`Connection failed: ${msg}`);
    process.exitCode = 1;
  }
}

/** List sources and let user select which to scan. */
async function listSourceSummary(
  connector: ReturnType<typeof getConnector>,
  spinner: ReturnType<typeof createSpinner>,
): Promise<void> {
  spinner.start('Discovering sources...');
  const sources = await connector.listSources();
  spinner.succeed(`Found ${sources.length} sources`);

  if (sources.length === 0) {
    process.stdout.write('\n  No sources found. You may need to share pages with the integration.\n');
    await offerPermissionEdit(connector.name);
    return;
  }

  process.stdout.write('\n  Available sources:\n');
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]!;
    process.stdout.write(`    [${i + 1}] ${src.name} (${src.type})\n`);
  }
  process.stdout.write(`    [a] Select all\n`);
  process.stdout.write(`    [p] Edit permissions (re-open ${connector.displayName} settings)\n`);
  process.stdout.write(`    [q] Quit\n`);

  if (!process.stdin.isTTY) {
    process.stdout.write('\n  Non-interactive mode — all sources available for scanning.\n\n');
    return;
  }

  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await new Promise<string>((resolve) => {
    rl.question('\n  Select sources (comma-separated numbers, a=all, p=permissions, q=quit): ', resolve);
  });
  rl.close();

  const choice = answer.trim().toLowerCase();

  if (choice === 'q') return;

  if (choice === 'p') {
    await offerPermissionEdit(connector.name);
    return;
  }

  let selected = sources;
  if (choice !== 'a') {
    const indices = choice.split(',').map((s) => parseInt(s.trim(), 10) - 1).filter((i) => i >= 0 && i < sources.length);
    if (indices.length === 0) {
      process.stdout.write('  No valid selection. Exiting.\n\n');
      return;
    }
    selected = indices.map((i) => sources[i]!).filter(Boolean);
  }

  process.stdout.write(`\n  Selected ${selected.length} source(s) for scanning.\n`);
  process.stdout.write(`  Run: ody-refine ingest --source ${selected.map((s) => s.id).join(',')}\n\n`);
}

/** Open the provider's integration settings to edit permissions. */
async function offerPermissionEdit(source: string): Promise<void> {
  const urls: Record<string, string> = {
    notion: 'https://www.notion.so/my-integrations',
    slack: 'https://api.slack.com/apps',
    linear: 'https://linear.app/settings/api',
    confluence: 'https://id.atlassian.com/manage-profile/apps',
    jira: 'https://id.atlassian.com/manage-profile/apps',
    gmail: 'https://myaccount.google.com/permissions',
    teams: 'https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps',
    'google-drive': 'https://myaccount.google.com/permissions',
    github: 'https://github.com/settings/tokens',
  };
  const url = urls[source];
  if (!url) return;

  process.stdout.write(`\n  Opening ${source} integration settings...\n`);
  process.stdout.write(`  Share the pages/channels you want Ody to scan with the integration.\n`);
  process.stdout.write(`  Then run 'ody-refine connect ${source}' again.\n\n`);

  try {
    const open = (await import('open')).default;
    await open(url);
  } catch {
    process.stdout.write(`  Could not open browser. Visit: ${url}\n\n`);
  }
}
