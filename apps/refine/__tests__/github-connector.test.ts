// EXCEEDS_LIMIT: test fixture file — comprehensive connector test coverage
/**
 * Tests for the GitHub connector: API client helpers, connector lifecycle,
 * and registry integration. Mocks fetch — no actual API access required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isDocFile } from '../src/connectors/github-api.js';
import type { GitHubConnector as GitHubConnectorType } from '../src/connectors/github.js';
import type { ConnectorDocument, ConnectorProgress } from '../src/connectors/types.js';

// ---------------------------------------------------------------------------
// isDocFile helper
// ---------------------------------------------------------------------------

describe('isDocFile', () => {
  it('matches README.md', () => {
    expect(isDocFile('README.md')).toBe(true);
  });

  it('matches CONTRIBUTING.md', () => {
    expect(isDocFile('CONTRIBUTING.md')).toBe(true);
  });

  it('matches docs/ markdown files', () => {
    expect(isDocFile('docs/getting-started.md')).toBe(true);
    expect(isDocFile('docs/api/reference.md')).toBe(true);
  });

  it('matches .github markdown files', () => {
    expect(isDocFile('.github/PULL_REQUEST_TEMPLATE.md')).toBe(true);
  });

  it('rejects source code files', () => {
    expect(isDocFile('src/index.ts')).toBe(false);
    expect(isDocFile('package.json')).toBe(false);
    expect(isDocFile('.gitignore')).toBe(false);
  });

  it('rejects CI configs', () => {
    expect(isDocFile('.github/workflows/ci.yml')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockFetchChain(
  ...responses: Array<{ ok: boolean; status: number; data?: unknown }>
): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok, status: r.status, statusText: r.ok ? 'OK' : 'Error',
      json: () => Promise.resolve(r.data ?? {}),
      text: () => Promise.resolve(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? {})),
      headers: new Map([['X-RateLimit-Remaining', '4999']]),
    });
  }
  return fn;
}

// ---------------------------------------------------------------------------
// GitHubConnector
// ---------------------------------------------------------------------------

describe('GitHubConnector', () => {
  let connector: GitHubConnectorType;

  async function createConnector(): Promise<GitHubConnectorType> {
    const { GitHubConnector } = await import('../src/connectors/github.js');
    return new GitHubConnector();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct connector metadata', async () => {
    connector = await createConnector();
    expect(connector.name).toBe('github');
    expect(connector.displayName).toBe('GitHub');
    expect(connector.authMethods).toContain('api-key');
    expect(connector.authMethods).toContain('oauth');
    expect(connector.supportsWriteBack).toBe(false);
  });

  it('throws ConnectorAuthError when not authenticated', async () => {
    connector = await createConnector();
    await expect(connector.listSources()).rejects.toThrow('Not authenticated');
  });

  it('validate returns false when not authenticated', async () => {
    connector = await createConnector();
    expect(await connector.validate()).toBe(false);
  });

  it('throws ConnectorAuthError when token is missing', async () => {
    connector = await createConnector();
    await expect(
      connector.authenticate({ method: 'api-key', token: '' }),
    ).rejects.toThrow('Token required');
  });

  it('throws ConnectorAuthError when token is invalid', async () => {
    connector = await createConnector();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, statusText: 'Unauthorized',
    }));
    await expect(
      connector.authenticate({ method: 'api-key', token: 'bad-token' }),
    ).rejects.toThrow('Invalid token');
  });

  it('authenticates successfully with a valid token', async () => {
    connector = await createConnector();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ login: 'testuser' }),
      headers: new Map([['X-RateLimit-Remaining', '4999']]),
    }));
    await connector.authenticate({ method: 'api-key', token: 'ghp_valid' });
    expect(await connector.validate()).toBe(true);
  });

  it('listSources returns repositories', async () => {
    connector = await createConnector();
    const mockFetch = mockFetchChain(
      // auth: /user
      { ok: true, status: 200, data: { login: 'testuser' } },
      // listRepos
      { ok: true, status: 200, data: [
        { id: 1, full_name: 'org/repo-1', name: 'repo-1',
          owner: { login: 'org' }, description: 'Test repo',
          html_url: 'https://github.com/org/repo-1',
          has_wiki: true, has_discussions: false,
          pushed_at: '2026-03-15T10:00:00Z', default_branch: 'main' },
      ] },
    );
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'api-key', token: 'ghp_valid' });
    const sources = await connector.listSources();

    expect(sources).toHaveLength(1);
    expect(sources[0]!.id).toBe('org/repo-1');
    expect(sources[0]!.type).toBe('repository');
  });

  it('fetchDocuments yields doc files from a repo', async () => {
    connector = await createConnector();
    const mockFetch = mockFetchChain(
      // auth
      { ok: true, status: 200, data: { login: 'testuser' } },
      // getRepoTree
      { ok: true, status: 200, data: {
        tree: [
          { path: 'README.md', type: 'blob', sha: 'abc' },
          { path: 'src/index.ts', type: 'blob', sha: 'def' },
          { path: 'docs/guide.md', type: 'blob', sha: 'ghi' },
        ],
      } },
      // getFileContent: README.md
      { ok: true, status: 200, data: {
        content: Buffer.from('# My Project\n\nThis is the README with enough content for the threshold check.').toString('base64'),
        encoding: 'base64',
      } },
      // getFileContent: docs/guide.md
      { ok: true, status: 200, data: {
        content: Buffer.from('# Guide\n\nComprehensive guide with detailed steps for getting started.').toString('base64'),
        encoding: 'base64',
      } },
      // listIssues (empty)
      { ok: true, status: 200, data: [] },
      // listPRs (empty)
      { ok: true, status: 200, data: [] },
      // listDiscussions - GraphQL returns error (disabled)
      { ok: false, status: 200, data: { errors: [{ message: 'Discussions disabled' }] } },
    );
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'api-key', token: 'ghp_valid' });
    const docs: ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments([
      { id: 'org/repo-1', name: 'org/repo-1', type: 'repository' },
    ])) {
      docs.push(doc);
    }

    expect(docs.length).toBeGreaterThanOrEqual(2);
    const readme = docs.find((d) => d.id.includes('README.md'));
    expect(readme).toBeDefined();
    expect(readme!.sourceType).toBe('github');
    expect(readme!.content).toContain('My Project');

    const guide = docs.find((d) => d.id.includes('docs/guide.md'));
    expect(guide).toBeDefined();
    expect(guide!.content).toContain('Comprehensive guide');
  });

  it('fetchDocuments yields issues with comments', async () => {
    connector = await createConnector();
    const mockFetch = mockFetchChain(
      // auth
      { ok: true, status: 200, data: { login: 'testuser' } },
      // getRepoTree (empty - no doc files)
      { ok: true, status: 200, data: { tree: [] } },
      // listIssues
      { ok: true, status: 200, data: [
        { number: 42, title: 'Fix bug in auth module', body: 'The auth module fails on expired tokens',
          html_url: 'https://github.com/org/repo-1/issues/42',
          user: { login: 'alice' }, state: 'open',
          created_at: '2026-03-10T10:00:00Z', updated_at: '2026-03-15T10:00:00Z',
          labels: [{ name: 'bug' }], comments: 1 },
      ] },
      // getIssueComments for #42
      { ok: true, status: 200, data: [
        { id: 1, body: 'I can reproduce this on latest main', user: { login: 'bob' },
          created_at: '2026-03-11T10:00:00Z', html_url: 'https://github.com/org/repo-1/issues/42#issuecomment-1' },
      ] },
      // listPRs (empty)
      { ok: true, status: 200, data: [] },
      // listDiscussions - GraphQL (empty)
      { ok: true, status: 200, data: { data: { repository: { discussions: { nodes: [], pageInfo: { hasNextPage: false, endCursor: '' } } } } } },
    );
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'api-key', token: 'ghp_valid' });
    const docs: ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments([
      { id: 'org/repo-1', name: 'org/repo-1', type: 'repository' },
    ])) {
      docs.push(doc);
    }

    const issue = docs.find((d) => d.id.includes('issue'));
    expect(issue).toBeDefined();
    expect(issue!.title).toBe('#42: Fix bug in auth module');
    expect(issue!.content).toContain('expired tokens');
    expect(issue!.content).toContain('reproduce this');
    expect(issue!.author).toBe('alice');
    expect(issue!.metadata['issueNumber']).toBe(42);
  });

  it('fetchDocuments reports progress', async () => {
    connector = await createConnector();
    const mockFetch = mockFetchChain(
      { ok: true, status: 200, data: { login: 'testuser' } },
      { ok: true, status: 200, data: { tree: [] } },
      { ok: true, status: 200, data: [] },
      { ok: true, status: 200, data: [] },
      { ok: false, status: 200, data: { errors: [{ message: 'N/A' }] } },
    );
    vi.stubGlobal('fetch', mockFetch);

    await connector.authenticate({ method: 'api-key', token: 'ghp_valid' });
    const events: ConnectorProgress[] = [];
    const gen = connector.fetchDocuments(
      [{ id: 'org/repo-1', name: 'org/repo-1', type: 'repository' }],
      (ev) => events.push(ev),
    );
    for await (const _doc of gen) { /* consume */ }

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.phase).toBe('fetch');
    expect(events[0]!.message).toContain('org/repo-1');
  });

  it('getInitialCursor returns a timestamp cursor', async () => {
    connector = await createConnector();
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('github');
    expect(cursor.value).toBeDefined();
  });

  it('writeBack returns not-supported error', async () => {
    connector = await createConnector();
    const result = await connector.writeBack('github:issue:o/r:1', 'corrected', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not supported');
  });
});

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

describe('Connector registry includes github', () => {
  it('getConnector returns a GitHubConnector', async () => {
    const { getConnector } = await import('../src/connectors/index.js');
    const connector = getConnector('github');
    expect(connector.name).toBe('github');
    expect(connector.displayName).toBe('GitHub');
  });

  it('listConnectors includes github as available', async () => {
    const { listConnectors } = await import('../src/connectors/index.js');
    const all = listConnectors();
    const github = all.find((c) => c.name === 'github');
    expect(github).toBeDefined();
    expect(github!.status).toBe('available');
  });
});
