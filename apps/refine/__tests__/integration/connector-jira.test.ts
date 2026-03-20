/**
 * Integration tests for the Jira connector.
 * Mocks JiraApiClient to test auth, project listing, issue fetch, and errors.
 * @module __tests__/integration/connector-jira
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraConnector } from '../../src/connectors/jira.js';
import { ConnectorAuthError } from '../../src/connectors/types.js';
import type { ConnectorDocument } from '../../src/connectors/types.js';

// --- Mock JiraApiClient ---

const mockValidateCredentials = vi.fn();
const mockFetchProjects = vi.fn();
const mockFetchIssues = vi.fn();
const mockExtractIssueText = vi.fn();

vi.mock('../../src/connectors/jira-api.js', () => ({
  JiraApiClient: class {
    validateCredentials = mockValidateCredentials;
    fetchProjects = mockFetchProjects;
    fetchIssues = mockFetchIssues;
    extractIssueText = mockExtractIssueText;
  },
  adfToPlainText: vi.fn().mockReturnValue('Plain text from ADF document'),
}));

vi.mock('../../src/connectors/resolve-credential.js', () => ({
  validateConnectorUrl: vi.fn(),
}));

// --- Helpers ---

async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>, max = 20,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) { docs.push(doc); if (docs.length >= max) break; }
  return docs;
}

interface MockIssue {
  id: string; key: string; self: string;
  fields: {
    summary: string; status: { name: string };
    assignee: { displayName: string } | null; labels: string[];
    description: null; comment?: { comments: Array<{ body: null; author?: { displayName: string } }> };
    updated: string;
  };
}

function makeIssue(id: string, key: string, summary: string): MockIssue {
  return {
    id, key, self: `https://mysite.atlassian.net/rest/api/3/issue/${id}`,
    fields: {
      summary, status: { name: 'In Progress' },
      assignee: { displayName: 'Alice' }, labels: ['bug', 'priority'],
      description: null,
      comment: { comments: [{ body: null, author: { displayName: 'Bob' } }] },
      updated: '2026-03-20T10:00:00.000Z',
    },
  };
}

// --- Tests ---

describe('Integration: Jira connector (mocked)', () => {
  let connector: JiraConnector;
  const auth = {
    method: 'api-key' as const, token: 'jira-token',
    params: { baseUrl: 'https://mysite.atlassian.net', email: 'user@example.com' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new JiraConnector();
    mockValidateCredentials.mockResolvedValue(true);
    mockExtractIssueText.mockImplementation((issue: MockIssue) => ({
      description: `Description for ${issue.key}: detailed technical requirements and specifications`,
      comments: ['Bob: This needs review before the next sprint planning session on Friday'],
      issueUrl: `https://mysite.atlassian.net/browse/${issue.key}`,
    }));
  });

  it('authenticates successfully with Basic auth', async () => {
    await connector.authenticate(auth);
    const valid = await connector.validate();
    expect(valid).toBe(true);
  });

  it('throws ConnectorAuthError when baseUrl is missing', async () => {
    await expect(
      connector.authenticate({ method: 'api-key', token: 'tok', params: { email: 'a@b.com' } }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('throws ConnectorAuthError when credentials are invalid', async () => {
    mockValidateCredentials.mockResolvedValueOnce(false);
    await expect(connector.authenticate(auth)).rejects.toThrow(ConnectorAuthError);
  });

  it('listSources returns projects', async () => {
    mockFetchProjects.mockResolvedValueOnce([
      { id: '1', key: 'ENG', name: 'Engineering' },
      { id: '2', key: 'OPS', name: 'Operations' },
    ]);
    await connector.authenticate(auth);
    const sources = await connector.listSources();
    expect(sources.length).toBe(2);
    expect(sources[0]!.id).toBe('ENG');
    expect(sources[0]!.type).toBe('project');
    expect(sources[0]!.name).toContain('Engineering');
  });

  it('fetchDocuments yields properly structured issue documents', async () => {
    mockFetchIssues.mockResolvedValueOnce([
      makeIssue('101', 'ENG-42', 'Fix login timeout'),
      makeIssue('102', 'ENG-43', 'Add dark mode support'),
    ]);
    await connector.authenticate(auth);
    const sources = [{ id: 'ENG', name: 'Engineering (ENG)', type: 'project' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(2);
    expect(docs[0]!.id).toBe('jira:issue:101');
    expect(docs[0]!.sourceType).toBe('jira');
    expect(docs[0]!.title).toContain('ENG-42');
    expect(docs[0]!.content).toContain('Fix login timeout');
  });

  it('fetchDocuments handles issues with comments', async () => {
    mockFetchIssues.mockResolvedValueOnce([makeIssue('201', 'OPS-1', 'Deploy pipeline')]);
    await connector.authenticate(auth);
    const sources = [{ id: 'OPS', name: 'Operations (OPS)', type: 'project' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(1);
    expect(docs[0]!.content).toContain('Comments');
  });

  it('handles empty project (no issues) gracefully', async () => {
    mockFetchIssues.mockResolvedValueOnce([]);
    await connector.authenticate(auth);
    const docs = await collectDocs(
      connector.fetchDocuments([{ id: 'EMPTY', name: 'Empty (EMPTY)', type: 'project' }]),
    );
    expect(docs.length).toBe(0);
  });

  it('writeBack returns not implemented', async () => {
    await connector.authenticate(auth);
    const result = await connector.writeBack!('jira:issue:101', 'text', 'reason');
    expect(result.success).toBe(false);
  });

  it('getInitialCursor returns a timestamp cursor', () => {
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('jira');
  });
});
