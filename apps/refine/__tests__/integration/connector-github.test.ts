/**
 * Integration tests for the GitHub connector.
 * Mocks GitHubApiClient to test auth, repo listing, doc/issue/PR/discussion fetch.
 * @module __tests__/integration/connector-github
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubConnector } from '../../src/connectors/github.js';
import { ConnectorAuthError } from '../../src/connectors/types.js';
import type { ConnectorDocument } from '../../src/connectors/types.js';

// --- Mock GitHubApiClient ---

const mockValidateToken = vi.fn();
const mockListRepos = vi.fn();
const mockGetRepoTree = vi.fn();
const mockGetFileContent = vi.fn();
const mockListIssues = vi.fn();
const mockGetIssueComments = vi.fn();
const mockListPRs = vi.fn();
const mockGetPRComments = vi.fn();
const mockListDiscussions = vi.fn();

vi.mock('../../src/connectors/github-api.js', () => ({
  GitHubApiClient: class {
    validateToken = mockValidateToken;
    listRepos = mockListRepos;
    getRepoTree = mockGetRepoTree;
    getFileContent = mockGetFileContent;
    listIssues = mockListIssues;
    getIssueComments = mockGetIssueComments;
    listPRs = mockListPRs;
    getPRComments = mockGetPRComments;
    listDiscussions = mockListDiscussions;
  },
  isDocFile: vi.fn().mockImplementation(
    (path: string) => /README\.md|docs\/.*\.md/i.test(path),
  ),
}));

// --- Helpers ---

async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>, max = 20,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) { docs.push(doc); if (docs.length >= max) break; }
  return docs;
}

// --- Tests ---

describe('Integration: GitHub connector (mocked)', () => {
  let connector: GitHubConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new GitHubConnector();
    mockValidateToken.mockResolvedValue(true);
    mockGetRepoTree.mockResolvedValue([]);
    mockListIssues.mockResolvedValue([]);
    mockListPRs.mockResolvedValue([]);
    mockListDiscussions.mockResolvedValue([]);
  });

  it('authenticates successfully with a valid token', async () => {
    await connector.authenticate({ method: 'api-key', token: 'ghp_test123' });
    const valid = await connector.validate();
    expect(valid).toBe(true);
  });

  it('throws ConnectorAuthError when token is missing', async () => {
    await expect(
      connector.authenticate({ method: 'api-key', token: '' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('throws ConnectorAuthError when token is invalid', async () => {
    mockValidateToken.mockResolvedValueOnce(false);
    await expect(
      connector.authenticate({ method: 'api-key', token: 'ghp_bad' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('listSources returns repositories', async () => {
    mockListRepos.mockResolvedValueOnce([
      { full_name: 'org/repo-a', name: 'repo-a', owner: { login: 'org' },
        html_url: 'https://github.com/org/repo-a', pushed_at: '2026-03-20',
        default_branch: 'main', has_wiki: false, has_discussions: true, description: null },
      { full_name: 'org/repo-b', name: 'repo-b', owner: { login: 'org' },
        html_url: 'https://github.com/org/repo-b', pushed_at: '2026-03-19',
        default_branch: 'main', has_wiki: false, has_discussions: false, description: null },
    ]);
    await connector.authenticate({ method: 'api-key', token: 'ghp_test' });
    const sources = await connector.listSources();
    expect(sources.length).toBe(2);
    expect(sources[0]!.id).toBe('org/repo-a');
    expect(sources[0]!.type).toBe('repository');
  });

  it('fetchDocuments yields doc files from the repo tree', async () => {
    mockGetRepoTree.mockResolvedValueOnce([
      { path: 'README.md', type: 'blob', sha: 'abc123' },
      { path: 'docs/guide.md', type: 'blob', sha: 'def456' },
      { path: 'src/index.ts', type: 'blob', sha: 'ghi789' },
    ]);
    mockGetFileContent
      .mockResolvedValueOnce('# Project README\n\nThis is the project documentation and getting started guide.')
      .mockResolvedValueOnce('# User Guide\n\nDetailed instructions on how to use the tool effectively.');
    await connector.authenticate({ method: 'api-key', token: 'ghp_test' });
    const sources = [{ id: 'org/repo-a', name: 'org/repo-a', type: 'repository' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    const docFiles = docs.filter((d) => d.id.includes('github:doc:'));
    expect(docFiles.length).toBe(2);
    expect(docFiles[0]!.sourceType).toBe('github');
  });

  it('fetchDocuments yields issue documents with comments', async () => {
    mockListIssues.mockResolvedValueOnce([{
      number: 42, title: 'Fix memory leak in worker pool',
      body: 'The worker pool does not release connections after idle timeout.',
      html_url: 'https://github.com/org/repo-a/issues/42',
      user: { login: 'alice' }, state: 'open',
      created_at: '2026-03-15', updated_at: '2026-03-20',
      labels: [{ name: 'bug' }], comments: 1,
    }]);
    mockGetIssueComments.mockResolvedValueOnce([{
      id: 1, body: 'I can reproduce this issue on Node 20 with the latest build.',
      user: { login: 'bob' }, created_at: '2026-03-16',
      html_url: 'https://github.com/org/repo-a/issues/42#comment-1',
    }]);
    await connector.authenticate({ method: 'api-key', token: 'ghp_test' });
    const sources = [{ id: 'org/repo-a', name: 'org/repo-a', type: 'repository' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    const issueDocs = docs.filter((d) => d.id.includes('github:issue:'));
    expect(issueDocs.length).toBe(1);
    expect(issueDocs[0]!.title).toContain('#42');
    expect(issueDocs[0]!.content).toContain('memory leak');
  });

  it('fetchDocuments yields PR documents', async () => {
    mockListPRs.mockResolvedValueOnce([{
      number: 100, title: 'Add caching layer for API responses',
      body: 'This PR implements Redis caching for frequently accessed endpoints.',
      html_url: 'https://github.com/org/repo-a/pull/100',
      user: { login: 'charlie' }, state: 'open',
      created_at: '2026-03-18', updated_at: '2026-03-20', merged_at: null,
    }]);
    mockGetPRComments.mockResolvedValueOnce([]);
    await connector.authenticate({ method: 'api-key', token: 'ghp_test' });
    const sources = [{ id: 'org/repo-a', name: 'org/repo-a', type: 'repository' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    const prDocs = docs.filter((d) => d.id.includes('github:pr:'));
    expect(prDocs.length).toBe(1);
    expect(prDocs[0]!.title).toContain('PR #100');
  });

  it('fetchDocuments yields discussion documents', async () => {
    mockListDiscussions.mockResolvedValueOnce([{
      number: 5, title: 'RFC: Migrate to ESM', author: 'dave',
      body: 'I propose we migrate all packages to ESM for better tree-shaking support.',
      url: 'https://github.com/org/repo-a/discussions/5',
      createdAt: '2026-03-10', updatedAt: '2026-03-20',
      comments: [{ body: 'I agree, let us plan the migration.', author: 'eve', createdAt: '2026-03-11' }],
    }]);
    await connector.authenticate({ method: 'api-key', token: 'ghp_test' });
    const sources = [{ id: 'org/repo-a', name: 'org/repo-a', type: 'repository' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    const discDocs = docs.filter((d) => d.id.includes('github:discussion:'));
    expect(discDocs.length).toBe(1);
    expect(discDocs[0]!.title).toContain('Discussion #5');
  });

  it('writeBack returns not supported', async () => {
    await connector.authenticate({ method: 'api-key', token: 'ghp_test' });
    const result = await connector.writeBack!('github:issue:org/repo:42', 'text', 'reason');
    expect(result.success).toBe(false);
  });

  it('getInitialCursor returns a timestamp cursor', () => {
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('github');
  });
});
