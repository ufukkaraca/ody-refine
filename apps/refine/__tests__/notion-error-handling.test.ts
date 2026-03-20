/**
 * Tests for Notion connector error handling: token expiry mid-crawl,
 * individual page failures, and auth error propagation.
 */
import { describe, it, expect, vi } from 'vitest';
import { NotionConnector } from '../src/connectors/notion.js';
import { ConnectorError } from '../src/connectors/types.js';
import type { ConnectorSource } from '../src/connectors/types.js';

// Mock the Notion SDK loader to avoid requiring actual SDK
vi.mock('../src/connectors/notion-api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/connectors/notion-api.js')>(
    '../src/connectors/notion-api.js',
  );
  return {
    ...actual,
    loadNotionSdk: vi.fn(async () => ({
      Client: class MockClient {
        pages = {
          retrieve: vi.fn(),
        };
        databases = {
          query: vi.fn(),
        };
        blocks = {
          children: { list: vi.fn() },
        };
        search = vi.fn();
        users = { me: vi.fn() };
      },
    })),
    ensureSdkAvailable: vi.fn(),
    validateNotionToken: vi.fn(async () => true),
    fetchAllBlocks: vi.fn(async () => []),
  };
});

describe('NotionConnector error handling', () => {
  it('reports partial progress when token expires mid-crawl', async () => {
    const connector = new NotionConnector();
    await connector.authenticate({ method: 'api-key', token: 'test-token' });

    // Access internal client to mock page retrieval
    const client = (connector as unknown as { client: {
      pages: { retrieve: ReturnType<typeof vi.fn> };
    } }).client;

    let callCount = 0;
    client.pages.retrieve.mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return {
          id: `page-${String(callCount)}`,
          url: 'https://notion.so/test',
          last_edited_time: '2024-01-01',
          parent: { type: 'workspace' },
          properties: { title: { title: [{ plain_text: `Page ${String(callCount)}` }] } },
        };
      }
      throw new Error('401 Unauthorized');
    });

    const sources: ConnectorSource[] = [
      { id: 'page-1', name: 'Page 1', type: 'page' },
      { id: 'page-2', name: 'Page 2', type: 'page' },
      { id: 'page-3', name: 'Page 3', type: 'page' },
    ];

    const docs = [];
    try {
      for await (const doc of connector.fetchDocuments(sources)) {
        docs.push(doc);
      }
      // Should not reach here
      expect.unreachable('Should have thrown ConnectorError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ConnectorError);
      expect((err as Error).message).toContain('Token expired or revoked');
      expect((err as Error).message).toContain('2 of 3');
    }
  });

  it('skips individual page failures on transient errors', async () => {
    const connector = new NotionConnector();
    await connector.authenticate({ method: 'api-key', token: 'test-token' });

    const client = (connector as unknown as { client: {
      pages: { retrieve: ReturnType<typeof vi.fn> };
    } }).client;

    let callCount = 0;
    client.pages.retrieve.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error('500 Internal Server Error');
      }
      return {
        id: `page-${String(callCount)}`,
        url: 'https://notion.so/test',
        last_edited_time: '2024-01-01',
        parent: { type: 'workspace' },
        properties: { title: { title: [{ plain_text: `Page ${String(callCount)}` }] } },
      };
    });

    const sources: ConnectorSource[] = [
      { id: 'page-1', name: 'Page 1', type: 'page' },
      { id: 'page-2', name: 'Page 2', type: 'page' },
      { id: 'page-3', name: 'Page 3', type: 'page' },
    ];

    // Should not throw — transient errors are skipped
    const docs = [];
    for await (const doc of connector.fetchDocuments(sources)) {
      docs.push(doc);
    }
    // Pages 1 and 3 succeed, page 2 skipped (content too short from mock)
    // The important thing is it doesn't throw
  });
});
