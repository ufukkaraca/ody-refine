/**
 * Integration tests for the Gmail connector.
 * Mocks GmailApiClient to test auth, label listing, message fetch, and errors.
 * @module __tests__/integration/connector-gmail
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailConnector, redactEmail } from '../../src/connectors/gmail.js';
import { ConnectorAuthError } from '../../src/connectors/types.js';
import type { ConnectorDocument } from '../../src/connectors/types.js';
import type { GmailMessageSummary } from '../../src/connectors/gmail-api.js';

// --- Mock GmailApiClient ---

const mockValidateToken = vi.fn();
const mockFetchLabels = vi.fn();
const mockListMessages = vi.fn();

vi.mock('../../src/connectors/gmail-api.js', () => ({
  GmailApiClient: class {
    validateToken = mockValidateToken;
    fetchLabels = mockFetchLabels;
    listMessages = mockListMessages;
    fetchProfile = vi.fn().mockResolvedValue({ emailAddress: 'test@example.com' });
  },
  mapGmailMessage: vi.fn(),
}));

// --- Helpers ---

async function collectDocs(
  gen: AsyncGenerator<ConnectorDocument, void, unknown>, max = 20,
): Promise<ConnectorDocument[]> {
  const docs: ConnectorDocument[] = [];
  for await (const doc of gen) { docs.push(doc); if (docs.length >= max) break; }
  return docs;
}

function makeMsg(id: string, subject: string, snippet: string): GmailMessageSummary {
  return {
    id, threadId: `thread-${id}`, subject, snippet,
    from: 'alice@example.com', to: ['bob@example.com'],
    date: '2026-03-20T10:00:00.000Z',
  };
}

// --- Tests ---

describe('Integration: Gmail connector (mocked)', () => {
  let connector: GmailConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new GmailConnector();
    mockValidateToken.mockResolvedValue(true);
  });

  it('authenticates successfully with a valid OAuth token', async () => {
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const valid = await connector.validate();
    expect(valid).toBe(true);
  });

  it('throws ConnectorAuthError when token is missing', async () => {
    await expect(
      connector.authenticate({ method: 'oauth', token: '' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('throws ConnectorAuthError when token validation fails', async () => {
    mockValidateToken.mockResolvedValueOnce(false);
    await expect(
      connector.authenticate({ method: 'oauth', token: 'ya29.bad' }),
    ).rejects.toThrow(ConnectorAuthError);
  });

  it('listSources returns system + user labels', async () => {
    mockFetchLabels.mockResolvedValueOnce([
      { id: 'INBOX', name: 'Inbox', type: 'system', messagesTotal: 100 },
      { id: 'SENT', name: 'Sent', type: 'system', messagesTotal: 50 },
      { id: 'Label_1', name: 'Work', type: 'user', messagesTotal: 25 },
    ]);
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const sources = await connector.listSources();
    // 4 defaults (INBOX, SENT, IMPORTANT, STARRED) + 1 user label
    expect(sources.length).toBe(5);
    expect(sources.every((s) => s.type === 'label')).toBe(true);
  });

  it('fetchDocuments yields properly structured email documents', async () => {
    mockListMessages.mockResolvedValueOnce([
      makeMsg('msg-1', 'Meeting Notes Q2', 'Discussed the roadmap for Q2 and budget allocations'),
      makeMsg('msg-2', 'Invoice #1234', 'Please find attached the invoice for consulting services'),
    ]);
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const sources = [{ id: 'INBOX', name: 'Inbox', type: 'label' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(2);
    expect(docs[0]!.id).toContain('gmail:msg:');
    expect(docs[0]!.sourceType).toBe('gmail');
    expect(docs[0]!.title).toBe('Meeting Notes Q2');
    expect(docs[0]!.content).toContain('Meeting Notes Q2');
  });

  it('fetchDocuments handles multiple labels (pagination by source)', async () => {
    mockListMessages
      .mockResolvedValueOnce([makeMsg('m1', 'Label A Email', 'Content for label A email body text')])
      .mockResolvedValueOnce([makeMsg('m2', 'Label B Email', 'Content for label B email body text')]);
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const sources = [
      { id: 'INBOX', name: 'Inbox', type: 'label' },
      { id: 'SENT', name: 'Sent', type: 'label' },
    ];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(2);
    expect(mockListMessages).toHaveBeenCalledTimes(2);
  });

  it('skips messages with content shorter than 20 chars', async () => {
    // The connector builds markdown with headers; use minimal fields so the
    // entire assembled string stays under 20 characters.
    mockListMessages.mockResolvedValueOnce([{
      id: 'x', threadId: 'tx', subject: '', snippet: '',
    }]);
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const sources = [{ id: 'INBOX', name: 'Inbox', type: 'label' }];
    const docs = await collectDocs(connector.fetchDocuments(sources));
    expect(docs.length).toBe(0);
  });

  it('redactEmail masks the local part of addresses', () => {
    expect(redactEmail('alice@example.com')).toBe('a***@example.com');
    expect(redactEmail('bob.smith@corp.io')).toBe('b***@corp.io');
  });

  it('writeBack always returns not supported', async () => {
    await connector.authenticate({ method: 'oauth', token: 'ya29.test' });
    const result = await connector.writeBack!('gmail:msg:t1:m1', 'text', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not supported');
  });

  it('getInitialCursor returns a change-token cursor', () => {
    const cursor = connector.getInitialCursor();
    expect(cursor.type).toBe('change-token');
    expect(cursor.connectorName).toBe('gmail');
  });
});
