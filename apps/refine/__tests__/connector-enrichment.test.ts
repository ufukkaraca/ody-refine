/**
 * Tests for Phase 2 enrichment: parentChain and analysisHints on connector docs.
 * Verifies that all connector document builders populate enrichment metadata.
 */
import { describe, it, expect } from 'vitest';
import { issueToDocument, linearDocToDocument } from '../src/connectors/linear.js';
import { issueToDocument as jiraIssueToDoc } from '../src/connectors/jira.js';
import type { ParentRef, AnalysisHints } from '../src/connectors/types.js';

// --- Linear ---

describe('Linear enrichment', () => {
  it('populates parentChain on issue with project', () => {
    const doc = issueToDocument({
      id: 'issue-1',
      identifier: 'ENG-42',
      title: 'Fix bug',
      description: 'This bug causes problems with the system workflow',
      url: 'https://linear.app/issue/ENG-42',
      state: { name: 'In Progress' },
      assignee: { name: 'Alice' },
      labels: { nodes: [] },
      project: { id: 'proj-1', name: 'Backend' },
      comments: { nodes: [] },
      updatedAt: new Date().toISOString(),
    });

    expect(doc).not.toBeNull();
    const chain = doc!.metadata['parentChain'] as ParentRef[];
    expect(chain).toHaveLength(3);
    expect(chain[0]).toEqual({ type: 'team', name: 'ENG' });
    expect(chain[1]).toEqual({ type: 'project', name: 'Backend', id: 'proj-1' });
    expect(chain[2]).toEqual({ type: 'issue', name: 'ENG-42', id: 'issue-1' });
  });

  it('populates parentChain on issue without project', () => {
    const doc = issueToDocument({
      id: 'issue-2',
      identifier: 'DES-10',
      title: 'Design review needed for landing page updates',
      description: 'Need to review the new landing page design updates',
      url: 'https://linear.app/issue/DES-10',
      state: { name: 'Todo' },
      assignee: null,
      labels: { nodes: [] },
      project: null,
      comments: { nodes: [] },
      updatedAt: new Date().toISOString(),
    });

    expect(doc).not.toBeNull();
    const chain = doc!.metadata['parentChain'] as ParentRef[];
    expect(chain).toHaveLength(2);
    expect(chain[0]).toEqual({ type: 'team', name: 'DES' });
    expect(chain[1]).toEqual({ type: 'issue', name: 'DES-10', id: 'issue-2' });
  });

  it('sets analysisHints on issue', () => {
    const doc = issueToDocument({
      id: 'issue-3',
      identifier: 'ENG-1',
      title: 'Setup project and configure deployment pipeline',
      description: 'Initial project setup including CI/CD pipeline',
      url: 'https://linear.app/issue/ENG-1',
      state: { name: 'Done' },
      assignee: null,
      labels: { nodes: [] },
      project: null,
      comments: { nodes: [] },
      updatedAt: new Date().toISOString(),
    });

    expect(doc).not.toBeNull();
    const hints = doc!.metadata['analysisHints'] as AnalysisHints;
    expect(hints.factDensity).toBe('normal');
    expect(hints.authoritative).toBe(false);
  });

  it('sets analysisHints on document as authoritative', () => {
    const doc = linearDocToDocument({
      id: 'doc-1',
      title: 'Architecture Decision Record',
      content: 'We decided to use PostgreSQL for the primary datastore because it provides strong consistency guarantees.',
      updatedAt: new Date().toISOString(),
      creator: { name: 'Alice' },
      project: { id: 'proj-1', name: 'Backend' },
    });

    expect(doc).not.toBeNull();
    const hints = doc!.metadata['analysisHints'] as AnalysisHints;
    expect(hints.authoritative).toBe(true);
  });
});

// --- Jira ---

describe('Jira enrichment', () => {
  it('populates parentChain from issue key', () => {
    const mockClient = {
      extractIssueText: () => ({
        description: 'Some description of the bug that needs to be fixed soon',
        comments: [],
        issueUrl: 'https://jira.example.com/browse/PLAT-123',
      }),
    };
    const doc = jiraIssueToDoc(mockClient as never, {
      id: '10001',
      key: 'PLAT-123',
      fields: {
        summary: 'Database migration fails on production',
        status: { name: 'Open' },
        assignee: null,
        labels: [],
        updated: new Date().toISOString(),
      },
    } as never);

    expect(doc).not.toBeNull();
    const chain = doc!.metadata['parentChain'] as ParentRef[];
    expect(chain).toHaveLength(2);
    expect(chain[0]).toEqual({ type: 'project', name: 'PLAT' });
    expect(chain[1]).toEqual({ type: 'issue', name: 'PLAT-123', id: '10001' });
  });
});
