/**
 * Integration tests for the Slack connector.
 * Mocks SlackApiClient to test auth, thread grouping, pagination, and errors.
 * @module __tests__/integration/connector-slack
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackConnector } from '../../src/connectors/slack.js';
import { ConnectorAuthError } from '../../src/connectors/types.js';
import type { ConnectorDocument } from '../../src/connectors/types.js';

// --- Mock SlackApiClient ---

const mockAuthTest = vi.fn();
const mockListChannels = vi.fn();
const mockFetchHistory = vi.fn();
const mockFetchReplies = vi.fn();
const mockPostMessage = vi.fn();
const mockResolveUser = vi.fn();

vi.mock('../../src/connectors/slack-api.js', () => ({
  SlackApiClient: class {
    authTest = mockAuthTest;
    listChannels = mockListChannels;
    fetchHistory = mockFetchHistory;
    fetchReplies = mockFetchReplies;
    postMessage = mockPostMessage;
    resolveUser = mockResolveUser;
  },
  checkSlackSdkAvailable: vi.fn().mockResolvedValue(false),
}));

// --- Helpers ---

async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>, max = 20,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) { docs.push(doc); if (docs.length >= max) break; }
  return docs;
}

function makeMessage(ts: string, text: string, threadTs?: string, replyCount?: number): Record<string, unknown> {
  return { ts, text, user: 'U001', thread_ts: threadTs, reply_count: replyCount };
}

// --- Tests ---

describe('Integration: Slack connector (mocked)', () => {
  let connector: SlackConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new SlackConnector();
    mockAuthTest.mockResolvedValue({ ok: true, user_id: 'U001', team: 'TestTeam' });
    mockResolveUser.mockImplementation((id: string) => Promise.resolve(`User_${id}`));
  });

  it('authenticates successfully with a valid bot token', async () => {
    await connector.authenticate({ method: 'bot-token', token: 'xoxb-test' });
    const valid = await connector.validate();
    expect(valid).toBe(true);
  });

  it('throws ConnectorAuthError when token is missing', async () => {
    await expect(
      connector.authenticate({ method: 'bot-token', token: '' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('throws ConnectorAuthError when auth.test fails', async () => {
    mockAuthTest.mockResolvedValueOnce({ ok: false, error: 'invalid_auth' });
    await expect(
      connector.authenticate({ method: 'bot-token', token: 'xoxb-bad' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('listSources returns only joined channels', async () => {
    mockListChannels.mockResolvedValueOnce([
      { id: 'C001', name: 'general', is_private: false, is_member: true, num_members: 10 },
      { id: 'C002', name: 'random', is_private: false, is_member: false, num_members: 5 },
      { id: 'C003', name: 'eng', is_private: true, is_member: true, num_members: 3 },
    ]);
    await connector.authenticate({ method: 'bot-token', token: 'xoxb-test' });
    const sources = await connector.listSources();
    expect(sources.length).toBe(2);
    expect(sources[0]!.id).toBe('C001');
    expect(sources[1]!.type).toBe('private_channel');
  });

  it('fetchDocuments yields thread documents with proper structure', async () => {
    const parentTs = '1710000000.000001';
    mockFetchHistory.mockResolvedValueOnce([
      makeMessage(parentTs, 'Thread starter about architecture', parentTs, 3),
      makeMessage('1710000001.000001', 'Reply 1', parentTs),
      makeMessage('1710000002.000001', 'Reply 2', parentTs),
      makeMessage('1710000003.000001', 'Reply 3', parentTs),
    ]);
    mockFetchReplies.mockResolvedValueOnce([]);
    await connector.authenticate({ method: 'bot-token', token: 'xoxb-test' });
    const sources = [{ id: 'C001', name: 'general', type: 'public_channel' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]!.id).toContain('slack:thread:C001:');
    expect(docs[0]!.sourceType).toBe('slack');
    expect(docs[0]!.content.length).toBeGreaterThan(0);
  });

  it('fetchDocuments fetches replies for threads with reply_count > 0', async () => {
    // With minThreadReplies=0, a thread with only the parent (no replies in
    // history) passes the group filter. The connector then sees
    // reply_count > 0 and thread.replies.length === 0, triggering fetchReplies.
    const parentTs = '1710000000.000001';
    const replyConnector = new SlackConnector();
    mockAuthTest.mockResolvedValueOnce({ ok: true, user_id: 'U001', team: 'T' });
    await replyConnector.authenticate({
      method: 'bot-token', token: 'xoxb-test',
      params: { minThreadReplies: '0' },
    });
    mockFetchHistory.mockResolvedValueOnce([
      makeMessage(parentTs, 'Thread parent about architecture decisions', parentTs, 3),
    ]);
    mockFetchReplies.mockResolvedValueOnce([
      makeMessage(parentTs, 'Thread parent about architecture decisions', parentTs),
      makeMessage('1710000001.000001', 'Full reply A with details', parentTs),
      makeMessage('1710000002.000001', 'Full reply B with details', parentTs),
    ]);
    const sources = [{ id: 'C001', name: 'general', type: 'public_channel' }];
    const docs = await collectDocs(replyConnector.fetchDocuments(sources));
    expect(docs.length).toBe(1);
    expect(mockFetchReplies).toHaveBeenCalledWith('C001', parentTs);
  });

  it('writeBack posts a thread reply and returns success', async () => {
    mockPostMessage.mockResolvedValueOnce({ ok: true, ts: '123.456' });
    await connector.authenticate({ method: 'bot-token', token: 'xoxb-test' });
    const result = await connector.writeBack!(
      'slack:thread:C001:1710000000.000001', 'Corrected text', 'Fact check',
    );
    expect(result.success).toBe(true);
    expect(result.updatedUrl).toContain('slack.com/archives/C001');
  });

  it('writeBack returns error for invalid document ID', async () => {
    await connector.authenticate({ method: 'bot-token', token: 'xoxb-test' });
    const result = await connector.writeBack!('invalid-id', 'text', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('getInitialCursor returns a timestamp cursor', () => {
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('timestamp');
    expect(cursor.connectorName).toBe('slack');
  });
});
