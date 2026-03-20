/**
 * Tests for the audit --deep multi-source collector.
 * Mocks connectors and verifies the collection + staging logic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';

// Mock credential store to isolate from real keychain
vi.mock('../src/connectors/credential-store.js', () => ({
  getCredential: vi.fn().mockResolvedValue(null),
  storeCredential: vi.fn(),
  removeCredential: vi.fn(),
}));

import { collectDeepAuditSources } from '../src/commands/audit-deep.js';
import type { DeepAuditCollectionResult } from '../src/commands/audit-deep.js';

/** Create a temp dir for test fixtures. */
function createTempDir(): string {
  const dir = join(tmpdir(), `ody-audit-test-${crypto.randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('collectDeepAuditSources', () => {
  let fixtureDir: string;
  let result: DeepAuditCollectionResult | undefined;

  beforeEach(() => {
    fixtureDir = createTempDir();
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
    if (result?.stagingDir) {
      rmSync(result.stagingDir, { recursive: true, force: true });
    }
    result = undefined;
    vi.restoreAllMocks();
  });

  it('copies local markdown files to staging directory', async () => {
    writeFileSync(join(fixtureDir, 'api.md'), '# API\n\nREST endpoints.');
    writeFileSync(join(fixtureDir, 'guide.md'), '# Guide\n\nGetting started.');
    writeFileSync(join(fixtureDir, 'ignore.js'), 'console.log("skip me");');

    result = await collectDeepAuditSources({ dir: fixtureDir });

    expect(result.localFileCount).toBe(2);
    expect(result.totalDocCount).toBe(2);
    expect(result.notionDocCount).toBe(0);
    expect(result.slackDocCount).toBe(0);

    const staged = readdirSync(result.stagingDir);
    expect(staged).toHaveLength(2);
    expect(staged.every((f) => f.startsWith('local-'))).toBe(true);
    expect(staged.every((f) => f.endsWith('.md'))).toBe(true);
  });

  it('copies local PDF and txt files', async () => {
    writeFileSync(join(fixtureDir, 'report.pdf'), 'fake-pdf-content');
    writeFileSync(join(fixtureDir, 'notes.txt'), 'plain text notes');

    result = await collectDeepAuditSources({ dir: fixtureDir });

    expect(result.localFileCount).toBe(2);
    const staged = readdirSync(result.stagingDir);
    expect(staged.some((f) => f.includes('report'))).toBe(true);
    expect(staged.some((f) => f.includes('notes'))).toBe(true);
  });

  it('ignores subdirectories (shallow copy)', async () => {
    writeFileSync(join(fixtureDir, 'top.md'), '# Top');
    mkdirSync(join(fixtureDir, 'sub'));
    writeFileSync(join(fixtureDir, 'sub', 'nested.md'), '# Nested');

    result = await collectDeepAuditSources({ dir: fixtureDir });

    expect(result.localFileCount).toBe(1);
  });

  it('returns empty result when dir has no supported files', async () => {
    writeFileSync(join(fixtureDir, 'readme.html'), '<h1>Hi</h1>');

    result = await collectDeepAuditSources({ dir: fixtureDir });

    expect(result.localFileCount).toBe(0);
    expect(result.totalDocCount).toBe(0);
  });

  it('throws when --notion is used without a token', async () => {
    const oldToken = process.env['NOTION_TOKEN'];
    delete process.env['NOTION_TOKEN'];

    try {
      await expect(
        collectDeepAuditSources({ includeNotion: true }),
      ).rejects.toThrow(/Notion token required/);
    } finally {
      if (oldToken) process.env['NOTION_TOKEN'] = oldToken;
    }
  });

  it('throws when --slack is used without a token', async () => {
    const oldToken = process.env['SLACK_BOT_TOKEN'];
    delete process.env['SLACK_BOT_TOKEN'];

    try {
      await expect(
        collectDeepAuditSources({ includeSlack: true }),
      ).rejects.toThrow(/Slack token required/);
    } finally {
      if (oldToken) process.env['SLACK_BOT_TOKEN'] = oldToken;
    }
  });

  it('throws when --confluence is used without a token', async () => {
    const oldToken = process.env['CONFLUENCE_API_TOKEN'];
    delete process.env['CONFLUENCE_API_TOKEN'];

    try {
      await expect(
        collectDeepAuditSources({ includeConfluence: true }),
      ).rejects.toThrow(/Confluence token required/);
    } finally {
      if (oldToken) process.env['CONFLUENCE_API_TOKEN'] = oldToken;
    }
  });

  it('throws when --jira is used without a token', async () => {
    const oldToken = process.env['JIRA_API_TOKEN'];
    delete process.env['JIRA_API_TOKEN'];

    try {
      await expect(
        collectDeepAuditSources({ includeJira: true }),
      ).rejects.toThrow(/Jira token required/);
    } finally {
      if (oldToken) process.env['JIRA_API_TOKEN'] = oldToken;
    }
  });

  it('reports progress messages', async () => {
    writeFileSync(join(fixtureDir, 'doc.md'), '# Progress test');
    const messages: string[] = [];

    result = await collectDeepAuditSources({
      dir: fixtureDir,
      onProgress: (msg) => messages.push(msg),
    });

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.includes('local files'))).toBe(true);
  });

  it('creates a unique staging directory', async () => {
    writeFileSync(join(fixtureDir, 'a.md'), '# A');

    const r1 = await collectDeepAuditSources({ dir: fixtureDir });
    const r2 = await collectDeepAuditSources({ dir: fixtureDir });

    expect(r1.stagingDir).not.toBe(r2.stagingDir);

    rmSync(r1.stagingDir, { recursive: true, force: true });
    rmSync(r2.stagingDir, { recursive: true, force: true });
  });
});

describe('audit --deep with mocked connectors', () => {
  let fixtureDir: string;
  let result: DeepAuditCollectionResult | undefined;

  beforeEach(() => {
    fixtureDir = createTempDir();
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
    if (result?.stagingDir) {
      rmSync(result.stagingDir, { recursive: true, force: true });
    }
    result = undefined;
    vi.restoreAllMocks();
  });

  it('fetches Notion docs via mocked connector and writes markdown', async () => {
    // Mock the connector module
    const mockDocs = [
      {
        id: 'notion:page:abc-123',
        title: 'Architecture Overview',
        content: 'Our system uses microservices.',
        sourceType: 'notion',
        sourceUrl: 'https://notion.so/abc123',
        metadata: {},
      },
      {
        id: 'notion:page:def-456',
        title: 'Onboarding Guide',
        content: 'New engineers should read the Architecture Overview first.',
        sourceType: 'notion',
        metadata: {},
      },
    ];

    vi.spyOn(
      await import('../src/connectors/index.js'),
      'getConnector',
    ).mockReturnValue({
      name: 'notion',
      displayName: 'Notion',
      authMethods: ['api-key' as const],
      supportsWriteBack: true,
      authenticate: vi.fn().mockResolvedValue(undefined),
      listSources: vi.fn().mockResolvedValue([
        { id: 'db-1', name: 'Knowledge Base', type: 'database' },
      ]),
      fetchDocuments: async function* () {
        for (const doc of mockDocs) yield doc;
      },
      fetchChanges: async function* () {},
      getInitialCursor: () => ({ type: 'timestamp', value: new Date().toISOString(), connectorName: 'test' }),
      validate: vi.fn().mockResolvedValue(true),
    });

    result = await collectDeepAuditSources({
      includeNotion: true,
      notionToken: 'test-notion-token',
    });

    expect(result.notionDocCount).toBe(2);
    expect(result.totalDocCount).toBe(2);

    const files = readdirSync(result.stagingDir);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.startsWith('notion-'))).toBe(true);

    // Check file content includes frontmatter and title
    const firstFile = readFileSync(
      join(result.stagingDir, files[0]!), 'utf-8',
    );
    expect(firstFile).toContain('---');
    expect(firstFile).toContain('source: notion');
  });

  it('fetches Confluence docs via mocked connector', async () => {
    vi.spyOn(
      await import('../src/connectors/index.js'),
      'getConnector',
    ).mockReturnValue({
      name: 'confluence',
      displayName: 'Confluence',
      authMethods: ['api-key' as const],
      supportsWriteBack: false,
      authenticate: vi.fn().mockResolvedValue(undefined),
      listSources: vi.fn().mockResolvedValue([
        { id: 'space-1', name: 'Engineering', type: 'space' },
      ]),
      fetchDocuments: async function* () {
        yield {
          id: 'confluence:page:101',
          title: 'Runbook',
          content: 'Steps for incident response.',
          sourceType: 'confluence',
          metadata: {},
        };
      },
      fetchChanges: async function* () {},
      getInitialCursor: () => ({ type: 'timestamp', value: new Date().toISOString(), connectorName: 'test' }),
      validate: vi.fn().mockResolvedValue(true),
    });

    result = await collectDeepAuditSources({
      includeConfluence: true,
      confluenceToken: 'test-conf-token',
      confluenceUrl: 'https://myco.atlassian.net',
      confluenceEmail: 'user@myco.com',
    });

    expect(result.confluenceDocCount).toBe(1);
    expect(result.totalDocCount).toBe(1);

    const files = readdirSync(result.stagingDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^confluence-/);
  });

  it('fetches Jira docs via mocked connector', async () => {
    vi.spyOn(
      await import('../src/connectors/index.js'),
      'getConnector',
    ).mockReturnValue({
      name: 'jira',
      displayName: 'Jira',
      authMethods: ['api-key' as const],
      supportsWriteBack: false,
      authenticate: vi.fn().mockResolvedValue(undefined),
      listSources: vi.fn().mockResolvedValue([
        { id: 'PROJ', name: 'Project (PROJ)', type: 'project' },
      ]),
      fetchDocuments: async function* () {
        yield {
          id: 'jira:issue:10001',
          title: 'PROJ-1: Fix login bug',
          content: '## Description\n\nLogin fails on mobile.',
          sourceType: 'jira',
          metadata: {},
        };
        yield {
          id: 'jira:issue:10002',
          title: 'PROJ-2: Add dark mode',
          content: '## Description\n\nUsers want dark mode.',
          sourceType: 'jira',
          metadata: {},
        };
      },
      fetchChanges: async function* () {},
      getInitialCursor: () => ({ type: 'timestamp', value: new Date().toISOString(), connectorName: 'test' }),
      validate: vi.fn().mockResolvedValue(true),
    });

    result = await collectDeepAuditSources({
      includeJira: true,
      jiraToken: 'test-jira-token',
      jiraUrl: 'https://myco.atlassian.net',
      jiraEmail: 'user@myco.com',
    });

    expect(result.jiraDocCount).toBe(2);
    expect(result.totalDocCount).toBe(2);

    const files = readdirSync(result.stagingDir);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.startsWith('jira-'))).toBe(true);
  });

  it('combines local files and connector docs', async () => {
    writeFileSync(join(fixtureDir, 'local.md'), '# Local Doc\n\nLocal content.');

    vi.spyOn(
      await import('../src/connectors/index.js'),
      'getConnector',
    ).mockReturnValue({
      name: 'slack',
      displayName: 'Slack',
      authMethods: ['bot-token' as const],
      supportsWriteBack: true,
      authenticate: vi.fn().mockResolvedValue(undefined),
      listSources: vi.fn().mockResolvedValue([
        { id: 'ch-1', name: 'general', type: 'public_channel' },
      ]),
      fetchDocuments: async function* () {
        yield {
          id: 'slack:thread:C01:1234.5678',
          title: 'Deployment discussion',
          content: 'We decided to use Kubernetes.',
          sourceType: 'slack',
          metadata: {},
        };
      },
      fetchChanges: async function* () {},
      getInitialCursor: () => ({ type: 'timestamp', value: new Date().toISOString(), connectorName: 'test' }),
      validate: vi.fn().mockResolvedValue(true),
    });

    result = await collectDeepAuditSources({
      dir: fixtureDir,
      includeSlack: true,
      slackToken: 'test-slack-bot-token',
    });

    expect(result.localFileCount).toBe(1);
    expect(result.slackDocCount).toBe(1);
    expect(result.totalDocCount).toBe(2);

    const files = readdirSync(result.stagingDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.startsWith('local-'))).toBe(true);
    expect(files.some((f) => f.startsWith('slack-'))).toBe(true);
  });
});
