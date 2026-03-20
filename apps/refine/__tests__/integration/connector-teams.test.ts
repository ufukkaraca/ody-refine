/**
 * Integration tests for the Microsoft Teams connector.
 * Mocks TeamsApiClient to test auth, team/channel listing, message fetch, and errors.
 * @module __tests__/integration/connector-teams
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamsConnector } from '../../src/connectors/teams.js';
import { ConnectorAuthError } from '../../src/connectors/types.js';
import type { ConnectorDocument } from '../../src/connectors/types.js';

// --- Mock TeamsApiClient ---

const mockValidateToken = vi.fn();
const mockFetchTeams = vi.fn();
const mockFetchChannels = vi.fn();
const mockFetchChannelMessages = vi.fn();

vi.mock('../../src/connectors/teams-api.js', () => ({
  TeamsApiClient: class {
    validateToken = mockValidateToken;
    fetchTeams = mockFetchTeams;
    fetchChannels = mockFetchChannels;
    fetchChannelMessages = mockFetchChannelMessages;
  },
  teamsHtmlToText: vi.fn().mockImplementation((html: string) => html),
}));

// --- Helpers ---

async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>, max = 20,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) { docs.push(doc); if (docs.length >= max) break; }
  return docs;
}

interface MockMessage {
  id: string; messageType: string;
  body: { content: string; contentType: string };
  from?: { user?: { displayName: string; id: string } };
  createdDateTime: string; webUrl?: string;
}

function makeMessage(id: string, content: string, author: string): MockMessage {
  return {
    id, messageType: 'message',
    body: { content, contentType: 'text' },
    from: { user: { displayName: author, id: `user-${id}` } },
    createdDateTime: '2026-03-20T10:00:00.000Z',
    webUrl: `https://teams.microsoft.com/messages/${id}`,
  };
}

// --- Tests ---

describe('Integration: Teams connector (mocked)', () => {
  let connector: TeamsConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new TeamsConnector();
    mockValidateToken.mockResolvedValue(true);
  });

  it('authenticates successfully with a valid OAuth token', async () => {
    await connector.authenticate({ method: 'oauth', token: 'eyJ.teams_test' });
    const valid = await connector.validate();
    expect(valid).toBe(true);
  });

  it('throws ConnectorAuthError when token is missing', async () => {
    await expect(
      connector.authenticate({ method: 'oauth', token: '' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('throws ConnectorAuthError when token is invalid', async () => {
    mockValidateToken.mockResolvedValueOnce(false);
    await expect(
      connector.authenticate({ method: 'oauth', token: 'eyJ.bad' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('listSources returns teams', async () => {
    mockFetchTeams.mockResolvedValueOnce([
      { id: 'team-1', displayName: 'Engineering', description: null },
      { id: 'team-2', displayName: 'Marketing', description: null },
    ]);
    await connector.authenticate({ method: 'oauth', token: 'eyJ.test' });
    const sources = await connector.listSources();
    expect(sources.length).toBe(2);
    expect(sources[0]!.id).toBe('team-1');
    expect(sources[0]!.name).toBe('Engineering');
    expect(sources[0]!.type).toBe('team');
  });

  it('fetchDocuments yields channel messages as documents', async () => {
    mockFetchChannels.mockResolvedValueOnce([
      { id: 'ch-1', displayName: 'General', description: null },
    ]);
    mockFetchChannelMessages.mockResolvedValueOnce({
      messages: [
        makeMessage('msg-1', 'We should update the deployment pipeline to use the new CI runner.', 'Alice'),
        makeMessage('msg-2', 'I agree, and we should also add smoke tests to the staging environment.', 'Bob'),
      ],
      nextDeltaLink: undefined,
    });
    await connector.authenticate({ method: 'oauth', token: 'eyJ.test' });
    const sources = [{ id: 'team-1', name: 'Engineering', type: 'team' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(2);
    expect(docs[0]!.id).toContain('teams:msg:team-1:ch-1:msg-1');
    expect(docs[0]!.sourceType).toBe('teams');
    expect(docs[0]!.title).toContain('Engineering');
    expect(docs[0]!.title).toContain('#General');
    expect(docs[0]!.author).toBe('Alice');
  });

  it('fetchDocuments handles multiple channels per team', async () => {
    mockFetchChannels.mockResolvedValueOnce([
      { id: 'ch-1', displayName: 'General', description: null },
      { id: 'ch-2', displayName: 'Announcements', description: null },
    ]);
    mockFetchChannelMessages
      .mockResolvedValueOnce({
        messages: [makeMessage('m1', 'General channel message with enough content to pass filter', 'Alice')],
      })
      .mockResolvedValueOnce({
        messages: [makeMessage('m2', 'Announcements channel message with enough content for filter', 'Bob')],
      });
    await connector.authenticate({ method: 'oauth', token: 'eyJ.test' });
    const sources = [{ id: 'team-1', name: 'Engineering', type: 'team' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(2);
    expect(mockFetchChannelMessages).toHaveBeenCalledTimes(2);
  });

  it('fetchDocuments handles multiple teams', async () => {
    mockFetchChannels
      .mockResolvedValueOnce([{ id: 'ch-a', displayName: 'General', description: null }])
      .mockResolvedValueOnce([{ id: 'ch-b', displayName: 'General', description: null }]);
    mockFetchChannelMessages
      .mockResolvedValueOnce({
        messages: [makeMessage('m1', 'Engineering team general channel discussion content', 'Alice')],
      })
      .mockResolvedValueOnce({
        messages: [makeMessage('m2', 'Marketing team general channel discussion content', 'Charlie')],
      });
    await connector.authenticate({ method: 'oauth', token: 'eyJ.test' });
    const sources = [
      { id: 'team-1', name: 'Engineering', type: 'team' },
      { id: 'team-2', name: 'Marketing', type: 'team' },
    ];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(2);
  });

  it('handles channels with no messages gracefully', async () => {
    mockFetchChannels.mockResolvedValueOnce([
      { id: 'ch-1', displayName: 'Empty', description: null },
    ]);
    mockFetchChannelMessages.mockResolvedValueOnce({ messages: [] });
    await connector.authenticate({ method: 'oauth', token: 'eyJ.test' });
    const sources = [{ id: 'team-1', name: 'Engineering', type: 'team' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(0);
  });

  it('writeBack returns not yet implemented', async () => {
    await connector.authenticate({ method: 'oauth', token: 'eyJ.test' });
    const result = await connector.writeBack!('teams:msg:t1:c1:m1', 'text', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet implemented');
  });

  it('getInitialCursor returns a timestamp cursor', () => {
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('teams');
  });
});
