/**
 * Tests for the typed connector error hierarchy.
 * Verifies construction, instanceof checks, and inheritance.
 */
import { describe, it, expect } from 'vitest';
import {
  ConnectorError,
  ConnectorAuthError,
  ConnectorRateLimitError,
  ConnectorTokenExpiredError,
  ConnectorServerError,
  ConnectorEntityError,
} from '../src/connectors/types.js';

describe('ConnectorError hierarchy', () => {
  describe('ConnectorRateLimitError', () => {
    it('constructs with retryAfter', () => {
      const err = new ConnectorRateLimitError('notion', 30);
      expect(err.connectorName).toBe('notion');
      expect(err.retryAfter).toBe(30);
      expect(err.name).toBe('ConnectorRateLimitError');
      expect(err.message).toContain('retry after 30s');
    });

    it('constructs without retryAfter', () => {
      const err = new ConnectorRateLimitError('slack');
      expect(err.retryAfter).toBeUndefined();
      expect(err.message).toContain('Rate limited');
    });

    it('is instanceof ConnectorError', () => {
      const err = new ConnectorRateLimitError('notion', 5);
      expect(err).toBeInstanceOf(ConnectorError);
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('ConnectorTokenExpiredError', () => {
    it('constructs as refreshable', () => {
      const err = new ConnectorTokenExpiredError('gmail', true);
      expect(err.connectorName).toBe('gmail');
      expect(err.refreshable).toBe(true);
      expect(err.name).toBe('ConnectorTokenExpiredError');
      expect(err.message).toContain('refreshable');
    });

    it('constructs as not refreshable', () => {
      const err = new ConnectorTokenExpiredError('slack', false);
      expect(err.refreshable).toBe(false);
      expect(err.message).toContain('not refreshable');
    });

    it('is instanceof ConnectorError', () => {
      const err = new ConnectorTokenExpiredError('gmail', true);
      expect(err).toBeInstanceOf(ConnectorError);
    });
  });

  describe('ConnectorServerError', () => {
    it('constructs with status code', () => {
      const err = new ConnectorServerError('confluence', 502);
      expect(err.connectorName).toBe('confluence');
      expect(err.statusCode).toBe(502);
      expect(err.name).toBe('ConnectorServerError');
      expect(err.message).toContain('502');
    });

    it('is instanceof ConnectorError', () => {
      const err = new ConnectorServerError('jira', 500);
      expect(err).toBeInstanceOf(ConnectorError);
    });
  });

  describe('ConnectorEntityError', () => {
    it('constructs with entityId and cause', () => {
      const err = new ConnectorEntityError('notion', 'page-123', 'access denied');
      expect(err.connectorName).toBe('notion');
      expect(err.entityId).toBe('page-123');
      expect(err.cause).toBe('access denied');
      expect(err.name).toBe('ConnectorEntityError');
      expect(err.message).toContain('page-123');
      expect(err.message).toContain('access denied');
    });

    it('is instanceof ConnectorError', () => {
      const err = new ConnectorEntityError('slack', 'ch-1', 'gone');
      expect(err).toBeInstanceOf(ConnectorError);
    });
  });

  describe('instanceof dispatch', () => {
    it('can be distinguished via instanceof', () => {
      const errors = [
        new ConnectorAuthError('a', 'bad token'),
        new ConnectorRateLimitError('b', 10),
        new ConnectorTokenExpiredError('c', true),
        new ConnectorServerError('d', 503),
        new ConnectorEntityError('e', 'id1', 'gone'),
      ];

      expect(errors[0]).toBeInstanceOf(ConnectorAuthError);
      expect(errors[0]).not.toBeInstanceOf(ConnectorRateLimitError);

      expect(errors[1]).toBeInstanceOf(ConnectorRateLimitError);
      expect(errors[1]).toBeInstanceOf(ConnectorError);

      expect(errors[2]).toBeInstanceOf(ConnectorTokenExpiredError);
      expect(errors[3]).toBeInstanceOf(ConnectorServerError);
      expect(errors[4]).toBeInstanceOf(ConnectorEntityError);
    });
  });
});
