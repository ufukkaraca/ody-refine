/**
 * Tests for the Linear connector: issue/doc conversion, auth, write-back.
 * Mocks the Linear GraphQL API — does not require actual API access.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LinearIssue, LinearDocument } from '../src/connectors/linear-api.js';
import { issueToDocument, linearDocToDocument } from '../src/connectors/linear.js';
import type { ConnectorDocument } from '../src/connectors/types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Create a minimal Linear issue. */
function makeIssue(overrides?: Partial<LinearIssue>): LinearIssue {
  return {
    id: 'issue-1',
    identifier: 'ENG-42',
    title: 'Fix authentication bug',
    description: 'Users are unable to log in when using SSO.',
    url: 'https://linear.app/team/issue/ENG-42',
    updatedAt: '2026-03-01T12:00:00Z',
    state: { name: 'In Progress' },
    assignee: { name: 'Alice' },
    labels: { nodes: [{ name: 'bug' }, { name: 'auth' }] },
    comments: {
      nodes: [
        { body: 'Investigating now.', user: { name: 'Alice' } },
        { body: 'Found the root cause.', user: { name: 'Bob' } },
      ],
    },
    project: { id: 'proj-1', name: 'Q1 Sprint' },
    ...overrides,
  };
}

/** Create a minimal Linear document. */
function makeDoc(overrides?: Partial<LinearDocument>): LinearDocument {
  return {
    id: 'doc-1',
    title: 'Architecture Overview',
    content: 'This document describes the overall system architecture and key design decisions.',
    updatedAt: '2026-03-01T12:00:00Z',
    creator: { name: 'Charlie' },
    project: { id: 'proj-1', name: 'Q1 Sprint' },
    ...overrides,
  };
}

/** Mock a successful GraphQL response. */
function mockGraphQL(data: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({ data }),
  }));
}

// ---------------------------------------------------------------------------
// issueToDocument
// ---------------------------------------------------------------------------

describe('issueToDocument', () => {
  it('converts an issue to a ConnectorDocument', () => {
    const doc = issueToDocument(makeIssue());
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe('linear:issue:issue-1');
    expect(doc!.title).toBe('ENG-42: Fix authentication bug');
    expect(doc!.sourceType).toBe('linear');
    expect(doc!.sourceUrl).toBe('https://linear.app/team/issue/ENG-42');
  });

  it('includes status in the content', () => {
    const doc = issueToDocument(makeIssue())!;
    expect(doc.content).toContain('**Status:** In Progress');
  });

  it('includes assignee in the content', () => {
    const doc = issueToDocument(makeIssue())!;
    expect(doc.content).toContain('**Assignee:** Alice');
  });

  it('includes labels in the content', () => {
    const doc = issueToDocument(makeIssue())!;
    expect(doc.content).toContain('**Labels:** bug, auth');
  });

  it('includes project name in the content', () => {
    const doc = issueToDocument(makeIssue())!;
    expect(doc.content).toContain('**Project:** Q1 Sprint');
  });

  it('includes description section', () => {
    const doc = issueToDocument(makeIssue())!;
    expect(doc.content).toContain('## Description');
    expect(doc.content).toContain('unable to log in');
  });

  it('includes comments section', () => {
    const doc = issueToDocument(makeIssue())!;
    expect(doc.content).toContain('## Comments');
    expect(doc.content).toContain('**Alice:**');
    expect(doc.content).toContain('Investigating now.');
    expect(doc.content).toContain('**Bob:**');
    expect(doc.content).toContain('Found the root cause.');
  });

  it('sets lastModified from updatedAt', () => {
    const doc = issueToDocument(makeIssue())!;
    expect(doc.lastModified).toBeInstanceOf(Date);
    expect(doc.lastModified!.toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });

  it('sets author from assignee', () => {
    const doc = issueToDocument(makeIssue())!;
    expect(doc.author).toBe('Alice');
  });

  it('sets metadata correctly', () => {
    const doc = issueToDocument(makeIssue())!;
    expect(doc.metadata['linearId']).toBe('issue-1');
    expect(doc.metadata['identifier']).toBe('ENG-42');
    expect(doc.metadata['status']).toBe('In Progress');
    expect(doc.metadata['labels']).toEqual(['bug', 'auth']);
    expect(doc.metadata['projectName']).toBe('Q1 Sprint');
    expect(doc.metadata['commentCount']).toBe(2);
  });

  it('handles issue without assignee', () => {
    const doc = issueToDocument(makeIssue({ assignee: null }))!;
    expect(doc.content).not.toContain('**Assignee:**');
    expect(doc.author).toBeUndefined();
  });

  it('handles issue without description', () => {
    const doc = issueToDocument(makeIssue({ description: null }))!;
    expect(doc.content).not.toContain('## Description');
  });

  it('handles issue without labels', () => {
    const doc = issueToDocument(makeIssue({ labels: { nodes: [] } }))!;
    expect(doc.content).not.toContain('**Labels:**');
  });

  it('handles issue without project', () => {
    const doc = issueToDocument(makeIssue({ project: null }))!;
    expect(doc.content).not.toContain('**Project:**');
    expect(doc.metadata['projectId']).toBeUndefined();
  });

  it('handles issue without comments', () => {
    const doc = issueToDocument(makeIssue({ comments: { nodes: [] } }))!;
    expect(doc.content).not.toContain('## Comments');
    expect(doc.metadata['commentCount']).toBe(0);
  });

  it('returns null for near-empty issues', () => {
    const doc = issueToDocument(makeIssue({
      identifier: 'A',
      title: '',
      description: null,
      comments: { nodes: [] },
      labels: { nodes: [] },
      project: null,
      assignee: null,
      state: { name: '' },
    }));
    expect(doc).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// linearDocToDocument
// ---------------------------------------------------------------------------

describe('linearDocToDocument', () => {
  it('converts a document to a ConnectorDocument', () => {
    const doc = linearDocToDocument(makeDoc());
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe('linear:doc:doc-1');
    expect(doc!.title).toBe('Architecture Overview');
    expect(doc!.sourceType).toBe('linear');
  });

  it('sets author from creator', () => {
    const doc = linearDocToDocument(makeDoc())!;
    expect(doc.author).toBe('Charlie');
  });

  it('sets metadata correctly', () => {
    const doc = linearDocToDocument(makeDoc())!;
    expect(doc.metadata['linearId']).toBe('doc-1');
    expect(doc.metadata['projectId']).toBe('proj-1');
    expect(doc.metadata['projectName']).toBe('Q1 Sprint');
  });

  it('returns null for near-empty documents', () => {
    const doc = linearDocToDocument(makeDoc({ content: 'short' }));
    expect(doc).toBeNull();
  });

  it('returns null for null content', () => {
    const doc = linearDocToDocument(makeDoc({ content: '' }));
    expect(doc).toBeNull();
  });

  it('handles document without creator', () => {
    const doc = linearDocToDocument(makeDoc({ creator: null }))!;
    expect(doc.author).toBeUndefined();
  });

  it('handles document without project', () => {
    const doc = linearDocToDocument(makeDoc({ project: null }))!;
    expect(doc.metadata['projectId']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// LinearConnector
// ---------------------------------------------------------------------------

describe('LinearConnector', () => {
  let connector: InstanceType<typeof import('../src/connectors/linear.js').LinearConnector>;

  beforeEach(async () => {
    const { LinearConnector } = await import('../src/connectors/linear.js');
    connector = new LinearConnector();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct connector metadata', () => {
    expect(connector.name).toBe('linear');
    expect(connector.displayName).toBe('Linear');
    expect(connector.authMethods).toContain('api-key');
    expect(connector.authMethods).toContain('oauth');
    expect(connector.supportsWriteBack).toBe(true);
  });

  it('throws ConnectorAuthError when not authenticated', async () => {
    await expect(connector.listSources()).rejects.toThrow('Not authenticated');
  });

  it('validate returns false when not authenticated', async () => {
    expect(await connector.validate()).toBe(false);
  });

  it('authenticate succeeds with valid token', async () => {
    mockGraphQL({ viewer: { id: 'user-1', name: 'Test', email: 'test@test.com' } });
    await connector.authenticate({ method: 'api-key', token: 'lin_api_test' });
    // Should not throw
  });

  it('authenticate throws on invalid token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
    }));

    await expect(
      connector.authenticate({ method: 'api-key', token: 'bad-token' }),
    ).rejects.toThrow('Invalid token');
  });

  it('authenticate uses LINEAR_API_KEY env var as fallback', async () => {
    vi.stubEnv('LINEAR_API_KEY', 'lin_api_from_env');
    mockGraphQL({ viewer: { id: 'user-1', name: 'Test', email: 'test@test.com' } });
    await connector.authenticate({ method: 'api-key', token: '' });
    // Should not throw — used env var
    vi.unstubAllGlobals();
  });

  it('listSources returns teams', async () => {
    // Auth call
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: { viewer: { id: 'user-1', name: 'Test', email: 'test@test.com' } },
        }),
      })
      // listSources / fetchTeamsAndProjects call
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: {
            teams: {
              nodes: [
                {
                  id: 'team-1', name: 'Engineering', key: 'ENG',
                  projects: { nodes: [{ id: 'p1', name: 'Sprint 1', state: 'started' }] },
                },
                {
                  id: 'team-2', name: 'Design', key: 'DES',
                  projects: { nodes: [] },
                },
              ],
            },
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await connector.authenticate({ method: 'api-key', token: 'lin_test' });
    const sources = await connector.listSources();

    expect(sources).toHaveLength(2);
    expect(sources[0]!.name).toBe('Engineering (ENG)');
    expect(sources[0]!.type).toBe('team');
    expect(sources[0]!.estimatedDocCount).toBe(1);
    expect(sources[1]!.name).toBe('Design (DES)');
    expect(sources[1]!.estimatedDocCount).toBe(0);
  });

  it('fetchDocuments yields issues and documents', async () => {
    const fetchMock = vi.fn()
      // auth
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: { viewer: { id: 'user-1', name: 'Test', email: 'test@test.com' } },
        }),
      })
      // fetchIssues
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [makeIssue()],
            },
          },
        }),
      })
      // fetchDocuments
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: {
            documents: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [makeDoc()],
            },
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await connector.authenticate({ method: 'api-key', token: 'lin_test' });

    const sources = [{ id: 'team-1', name: 'Engineering', type: 'team' }];
    const docs: ConnectorDocument[] = [];
    for await (const doc of connector.fetchDocuments(sources)) {
      docs.push(doc);
    }

    expect(docs).toHaveLength(2);
    expect(docs[0]!.id).toBe('linear:issue:issue-1');
    expect(docs[1]!.id).toBe('linear:doc:doc-1');
  });

  it('writeBack returns error for invalid document ID', async () => {
    mockGraphQL({ viewer: { id: 'user-1', name: 'Test', email: 'test@test.com' } });
    await connector.authenticate({ method: 'api-key', token: 'lin_test' });

    const result = await connector.writeBack('bad-id', 'content', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid document ID');
  });

  it('writeBack returns error for doc type (not issue)', async () => {
    mockGraphQL({ viewer: { id: 'user-1', name: 'Test', email: 'test@test.com' } });
    await connector.authenticate({ method: 'api-key', token: 'lin_test' });

    const result = await connector.writeBack(
      'linear:doc:doc-1', 'content', 'reason',
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('only supported for issues');
  });

  it('writeBack succeeds for valid issue ID', async () => {
    const fetchMock = vi.fn()
      // auth
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: { viewer: { id: 'user-1', name: 'Test', email: 'test@test.com' } },
        }),
      })
      // issueUpdate mutation
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: {
            issueUpdate: {
              success: true,
              issue: { id: 'issue-1', identifier: 'ENG-42', url: 'https://linear.app/...' },
            },
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await connector.authenticate({ method: 'api-key', token: 'lin_test' });

    const result = await connector.writeBack(
      'linear:issue:issue-1',
      'Updated description',
      'typo fix',
    );
    expect(result.success).toBe(true);
    expect(result.updatedUrl).toContain('linear.app');
  });
});

// ---------------------------------------------------------------------------
// LinearApiClient
// ---------------------------------------------------------------------------

describe('LinearApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries on 429 rate limit', async () => {
    const { LinearApiClient } = await import('../src/connectors/linear-api.js');

    const fetchMock = vi.fn()
      // First call: 429
      .mockResolvedValueOnce({
        ok: false, status: 429,
        headers: new Headers({ 'Retry-After': '0' }),
      })
      // Second call: success
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve({
          data: { viewer: { id: 'user-1' } },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = new LinearApiClient('test-token');
    const result = await client.query<{ viewer: { id: string } }>(
      'query { viewer { id } }',
    );
    expect(result.viewer.id).toBe('user-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on GraphQL errors', async () => {
    const { LinearApiClient } = await import('../src/connectors/linear-api.js');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      json: () => Promise.resolve({
        errors: [{ message: 'Field not found' }],
      }),
    }));

    const client = new LinearApiClient('test-token');
    await expect(
      client.query('query { bad }'),
    ).rejects.toThrow('Field not found');
  });

  it('validateToken returns true for valid token', async () => {
    const { LinearApiClient } = await import('../src/connectors/linear-api.js');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      json: () => Promise.resolve({
        data: { viewer: { id: 'user-1', name: 'Test', email: 'test@test.com' } },
      }),
    }));

    const client = new LinearApiClient('valid-token');
    expect(await client.validateToken()).toBe(true);
  });

  it('validateToken returns false for invalid token', async () => {
    const { LinearApiClient } = await import('../src/connectors/linear-api.js');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, statusText: 'Unauthorized',
      headers: new Headers(),
    }));

    const client = new LinearApiClient('bad-token');
    expect(await client.validateToken()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

describe('connector registry', () => {
  it('linear is registered and available', async () => {
    const { getConnector, listConnectors, listAvailableConnectors } = await import(
      '../src/connectors/index.js'
    );

    const connector = getConnector('linear');
    expect(connector.name).toBe('linear');

    const all = listConnectors();
    const linearInfo = all.find((c) => c.name === 'linear');
    expect(linearInfo).toBeDefined();
    expect(linearInfo!.status).toBe('available');

    const available = listAvailableConnectors();
    expect(available.some((c) => c.name === 'linear')).toBe(true);
  });
});
