/**
 * Integration smoke tests for Ody Refine connectors.
 *
 * These tests call REAL APIs using sandbox/test-account credentials.
 * They skip gracefully when the required env vars are not set.
 *
 * Run with:
 *   NOTION_API_KEY=xxx LINEAR_API_KEY=xxx pnpm --filter ody-refine test -- integration/
 *
 * Each connector suite has a 30 s timeout to account for real network calls.
 * @module __tests__/integration/connector-smoke
 */
import { describe, it, expect } from 'vitest';
import type {
  ConnectorDocument,
  ConnectorSource,
  RefineConnector,
} from '../../src/connectors/types.js';
import { NotionConnector } from '../../src/connectors/notion.js';
import { LinearConnector } from '../../src/connectors/linear.js';
import { SlackConnector } from '../../src/connectors/slack.js';
import { ConfluenceConnector } from '../../src/connectors/confluence.js';
import { JiraConnector } from '../../src/connectors/jira.js';
import { TeamsConnector } from '../../src/connectors/teams.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect up to `max` documents from an async generator. */
async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>,
  max: number,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) {
    docs.push(doc);
    if (docs.length >= max) break;
  }
  return docs;
}

/** Assert that a value conforms to the ConnectorDocument interface shape. */
function assertDocumentShape(doc: ConnectorDocument): void {
  expect(typeof doc.id).toBe('string');
  expect(doc.id.length).toBeGreaterThan(0);

  expect(typeof doc.title).toBe('string');
  expect(doc.title.length).toBeGreaterThan(0);

  expect(typeof doc.content).toBe('string');
  expect(doc.content.length).toBeGreaterThan(0);

  expect(typeof doc.sourceType).toBe('string');
  expect(doc.sourceType.length).toBeGreaterThan(0);

  // Optional fields — must be correct type when present
  if (doc.sourceUrl !== undefined) {
    expect(typeof doc.sourceUrl).toBe('string');
  }
  if (doc.lastModified !== undefined) {
    expect(doc.lastModified).toBeInstanceOf(Date);
  }
  if (doc.author !== undefined) {
    expect(typeof doc.author).toBe('string');
  }

  expect(doc.metadata).toBeDefined();
  expect(typeof doc.metadata).toBe('object');
}

/** Assert that a source conforms to the ConnectorSource interface shape. */
function assertSourceShape(source: ConnectorSource): void {
  expect(typeof source.id).toBe('string');
  expect(source.id.length).toBeGreaterThan(0);

  expect(typeof source.name).toBe('string');
  expect(source.name.length).toBeGreaterThan(0);

  expect(typeof source.type).toBe('string');
  expect(source.type.length).toBeGreaterThan(0);
}

/**
 * Run the standard smoke test sequence for any connector:
 *   1. authenticate()
 *   2. listSources()  — verify shape
 *   3. fetchDocuments() for the first source — collect 1 page, verify shape
 */
async function smokeTestConnector(
  connector: RefineConnector,
  auth: Parameters<RefineConnector['authenticate']>[0],
): Promise<void> {
  // Step 1 — authenticate
  await connector.authenticate(auth);

  // Step 2 — validate (should return true after successful auth)
  const isValid = await connector.validate();
  expect(isValid).toBe(true);

  // Step 3 — list sources
  const sources = await connector.listSources();
  expect(Array.isArray(sources)).toBe(true);
  expect(sources.length).toBeGreaterThan(0);

  for (const source of sources.slice(0, 3)) {
    assertSourceShape(source);
  }

  // Step 4 — fetch documents from the first source (limit to 5)
  const firstSource = sources[0]!;
  const docs = await collectDocs(
    connector.fetchDocuments([firstSource]),
    5,
  );

  // The source might be empty, but if we got docs, they must be valid
  for (const doc of docs) {
    assertDocumentShape(doc);
    expect(doc.sourceType).toBe(connector.name);
  }
}

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------

const NOTION_API_KEY = process.env['NOTION_API_KEY'];

describe.skipIf(!NOTION_API_KEY)('Integration: Notion connector', () => {
  it('authenticate -> listSources -> fetchDocuments', async () => {
    const connector = new NotionConnector();
    await smokeTestConnector(connector, {
      method: 'api-key',
      token: NOTION_API_KEY!,
    });
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Linear
// ---------------------------------------------------------------------------

const LINEAR_API_KEY = process.env['LINEAR_API_KEY'];

describe.skipIf(!LINEAR_API_KEY)('Integration: Linear connector', () => {
  it('authenticate -> listSources -> fetchDocuments', async () => {
    const connector = new LinearConnector();
    await smokeTestConnector(connector, {
      method: 'api-key',
      token: LINEAR_API_KEY!,
    });
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'];

describe.skipIf(!SLACK_BOT_TOKEN)('Integration: Slack connector', () => {
  it('authenticate -> listSources -> fetchDocuments', async () => {
    const connector = new SlackConnector();
    await smokeTestConnector(connector, {
      method: 'bot-token',
      token: SLACK_BOT_TOKEN!,
    });
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Confluence
// ---------------------------------------------------------------------------

const CONFLUENCE_URL = process.env['CONFLUENCE_URL'];
const CONFLUENCE_EMAIL = process.env['CONFLUENCE_EMAIL'];
const CONFLUENCE_API_TOKEN = process.env['CONFLUENCE_API_TOKEN'];
const hasConfluence = !!(CONFLUENCE_URL && CONFLUENCE_EMAIL && CONFLUENCE_API_TOKEN);

describe.skipIf(!hasConfluence)('Integration: Confluence connector', () => {
  it('authenticate -> listSources -> fetchDocuments', async () => {
    const connector = new ConfluenceConnector();
    await smokeTestConnector(connector, {
      method: 'api-key',
      token: CONFLUENCE_API_TOKEN!,
      params: {
        baseUrl: CONFLUENCE_URL!,
        email: CONFLUENCE_EMAIL!,
      },
    });
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Jira
// ---------------------------------------------------------------------------

const JIRA_URL = process.env['JIRA_URL'];
const JIRA_EMAIL = process.env['JIRA_EMAIL'];
const JIRA_API_TOKEN = process.env['JIRA_API_TOKEN'];
const hasJira = !!(JIRA_URL && JIRA_EMAIL && JIRA_API_TOKEN);

describe.skipIf(!hasJira)('Integration: Jira connector', () => {
  it('authenticate -> listSources -> fetchDocuments', async () => {
    const connector = new JiraConnector();
    await smokeTestConnector(connector, {
      method: 'api-key',
      token: JIRA_API_TOKEN!,
      params: {
        baseUrl: JIRA_URL!,
        email: JIRA_EMAIL!,
      },
    });
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Microsoft Teams
// ---------------------------------------------------------------------------

const TEAMS_ACCESS_TOKEN = process.env['TEAMS_ACCESS_TOKEN'];

describe.skipIf(!TEAMS_ACCESS_TOKEN)('Integration: Teams connector', () => {
  it('authenticate -> listSources -> fetchDocuments', async () => {
    const connector = new TeamsConnector();
    await smokeTestConnector(connector, {
      method: 'oauth',
      token: TEAMS_ACCESS_TOKEN!,
    });
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Meta: ensure at least one suite was defined (catches import errors)
// ---------------------------------------------------------------------------

describe('Integration: connector smoke tests loaded', () => {
  it('test file parsed successfully', () => {
    expect(true).toBe(true);
  });
});
