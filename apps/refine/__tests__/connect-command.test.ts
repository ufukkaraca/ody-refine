/**
 * Tests for the connect command — verifies subcommand registration and help text.
 * Uses the built CLI binary; does not require live API access.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = join(import.meta.dirname ?? '.', '..', 'dist', 'cli.js');

/** Empty temp dir used as ODY_CREDENTIAL_DIR to isolate tests from real keychain. */
const ISOLATED_CRED_DIR = mkdtempSync(join(tmpdir(), 'ody-test-creds-'));

/** Env that disables keychain and points to an empty credential store. */
const TEST_ENV = { ...process.env, ODY_CREDENTIAL_DIR: ISOLATED_CRED_DIR };

function runCli(args: string[]): string {
  const proc = spawnSync('node', [CLI, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
    env: TEST_ENV,
  });
  return (proc.stdout ?? '') + (proc.stderr ?? '');
}

describe('connect command', () => {
  it('connect is registered as a subcommand in the main CLI', () => {
    const output = runCli(['--help']);
    expect(output).toContain('connect');
  });

  it('connect --help shows description and examples', () => {
    const output = runCli(['connect', '--help']);
    expect(output).toContain('Connect to a data source');
    expect(output).toContain('slack');
    expect(output).toContain('notion');
    expect(output).toContain('--token');
    expect(output).toContain('--list');
  });

  it('connect list shows available connectors', () => {
    const output = runCli(['connect', '--list']);
    expect(output).toContain('Notion');
    expect(output).toContain('Slack');
  });

  it('connect without args shows connector list', () => {
    const output = runCli(['connect']);
    expect(output).toContain('Available connectors');
    expect(output).toContain('Notion');
    expect(output).toContain('Slack');
  });

  it('connect unknown-connector fails gracefully', () => {
    const output = runCli(['connect', 'foobar']);
    // Should mention unknown connector or show error
    expect(output).toMatch(/unknown|not|error|fail|available/i);
  });

  it('connect slack without token shows token error', () => {
    // Remove env var and isolate from keychain to ensure no token is present
    const proc = spawnSync('node', [CLI, 'connect', 'slack'], {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...TEST_ENV, SLACK_BOT_TOKEN: undefined },
    });
    const output = (proc.stdout ?? '') + (proc.stderr ?? '');
    expect(output).toMatch(/token|SLACK_BOT_TOKEN/i);
  });

  it('connect notion without token shows token error', () => {
    const proc = spawnSync('node', [CLI, 'connect', 'notion'], {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...TEST_ENV, NOTION_TOKEN: undefined },
    });
    const output = (proc.stdout ?? '') + (proc.stderr ?? '');
    expect(output).toMatch(/token|NOTION_TOKEN/i);
  });
});
