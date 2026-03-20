/**
 * Integration tests for the Linear connector.
 * Mocks LinearApiClient to test auth, teams, issues, docs, and write-back.
 * @module __tests__/integration/connector-linear
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearConnector } from '../../src/connectors/linear.js';
import { ConnectorAuthError } from '../../src/connectors/types.js';
import type { ConnectorDocument } from '../../src/connectors/types.js';

// --- Mock LinearApiClient ---

const mockValidateToken = vi.fn();
const mockFetchTeamsAndProjects = vi.fn();
const mockFetchIssues = vi.fn();
const mockFetchDocuments = vi.fn();
const mockQuery = vi.fn();

vi.mock('../../src/connectors/linear-api.js', () => ({
  LinearApiClient: class {
    validateToken = mockValidateToken;
    fetchTeamsAndProjects = mockFetchTeamsAndProjects;
    fetchIssues = mockFetchIssues;
    fetchDocuments = mockFetchDocuments;
    query = mockQuery;
  },
}));

// --- Helpers ---

async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>, max = 20,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) { docs.push(doc); if (docs.length >= max) break; }
  return docs;
}

function makeIssue(id: string, identifier: string, title: string): Record<string, unknown> {
  return {
    id, identifier, title, url: `https://linear.app/team/issue/${id}`,
    description: `Detailed description for ${title} with enough content to pass the minimum`,
    updatedAt: '2026-03-20T10:00:00.000Z',
    state: { name: 'In Progress' },
    assignee: { name: 'Alice' },
    labels: { nodes: [{ name: 'bug' }, { name: 'urgent' }] },
    comments: { nodes: [
      { body: 'This needs attention before the release deadline next week', user: { name: 'Bob' } },
    ] },
    project: { id: 'proj-1', name: 'Q2 Release' },
  };
}

function makeLinearDoc(id: string, title: string): Record<string, unknown> {
  return {
    id, title,
    content: `Full document content for ${title} with architecture decisions and implementation details`,
    updatedAt: '2026-03-20T10:00:00.000Z',
    creator: { name: 'Charlie' },
    project: { id: 'proj-1', name: 'Q2 Release' },
  };
}

// --- Tests ---

describe('Integration: Linear connector (mocked)', () => {
  let connector: LinearConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new LinearConnector();
    mockValidateToken.mockResolvedValue(true);
  });

  it('authenticates successfully with a valid API key', async () => {
    await connector.authenticate({ method: 'api-key', token: 'lin_test_key' });
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
      connector.authenticate({ method: 'api-key', token: 'lin_bad' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('listSources returns teams with project counts', async () => {
    mockFetchTeamsAndProjects.mockResolvedValueOnce({
      teams: [
        { id: 'team-1', name: 'Frontend', key: 'FE' },
        { id: 'team-2', name: 'Backend', key: 'BE' },
      ],
      projects: [
        { id: 'p1', name: 'Q2', state: 'started', teamId: 'team-1', teamName: 'Frontend' },
        { id: 'p2', name: 'Infra', state: 'started', teamId: 'team-2', teamName: 'Backend' },
      ],
    });
    await connector.authenticate({ method: 'api-key', token: 'lin_test' });
    const sources = await connector.listSources();
    expect(sources.length).toBe(2);
    expect(sources[0]!.type).toBe('team');
    expect(sources[0]!.name).toContain('Frontend');
    expect(sources[0]!.estimatedDocCount).toBe(1);
  });

  it('fetchDocuments yields issues and documents', async () => {
    mockFetchIssues.mockResolvedValueOnce([
      makeIssue('i1', 'FE-101', 'Fix dropdown component'),
      makeIssue('i2', 'FE-102', 'Add toast notifications'),
    ]);
    mockFetchDocuments.mockResolvedValueOnce([
      makeLinearDoc('d1', 'Architecture Decision Record'),
    ]);
    await connector.authenticate({ method: 'api-key', token: 'lin_test' });
    const sources = [{ id: 'team-1', name: 'Frontend (FE)', type: 'team' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(3);
    // Check issue doc
    const issueDocs = docs.filter((d) => d.id.startsWith('linear:issue:'));
    expect(issueDocs.length).toBe(2);
    expect(issueDocs[0]!.sourceType).toBe('linear');
    expect(issueDocs[0]!.content).toContain('Fix dropdown component');
    // Check linear doc
    const linearDocs = docs.filter((d) => d.id.startsWith('linear:doc:'));
    expect(linearDocs.length).toBe(1);
    expect(linearDocs[0]!.title).toBe('Architecture Decision Record');
  });

  it('fetchDocuments handles empty issue and document lists', async () => {
    mockFetchIssues.mockResolvedValueOnce([]);
    mockFetchDocuments.mockResolvedValueOnce([]);
    await connector.authenticate({ method: 'api-key', token: 'lin_test' });
    const sources = [{ id: 'team-1', name: 'Frontend (FE)', type: 'team' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(0);
  });

  it('writeBack updates issue description via GraphQL mutation', async () => {
    mockQuery.mockResolvedValueOnce({
      issueUpdate: { success: true, issue: { id: 'i1', identifier: 'FE-101', url: 'https://linear.app/issue/i1' } },
    });
    await connector.authenticate({ method: 'api-key', token: 'lin_test' });
    const result = await connector.writeBack!('linear:issue:i1', 'New description', 'Fix typo');
    expect(result.success).toBe(true);
    expect(result.updatedUrl).toContain('linear.app');
  });

  it('writeBack rejects non-issue document types', async () => {
    await connector.authenticate({ method: 'api-key', token: 'lin_test' });
    const result = await connector.writeBack!('linear:doc:d1', 'text', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('only supported for issues');
  });

  it('writeBack returns error for invalid document ID', async () => {
    await connector.authenticate({ method: 'api-key', token: 'lin_test' });
    const result = await connector.writeBack!('bad-id', 'text', 'reason');
    expect(result.success).toBe(false);
  });

  it('getInitialCursor returns a timestamp cursor', () => {
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('linear');
  });
});
