import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetrainingHistory } from '../src/retraining-history.js';
import type { RetrainingEvent } from '../src/retraining-history.js';

/** In-memory SQLite mock for testing. */
function createMockDb(): {
  db: unknown;
  rows: Record<string, unknown>[];
} {
  const rows: Record<string, unknown>[] = [];

  const db = {
    exec: vi.fn(),
    prepare: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('INSERT')) {
        return {
          run: vi.fn((...params: unknown[]) => {
            rows.push({
              id: params[0],
              model_id: params[1],
              base_model: params[2],
              pair_count: params[3],
              eval_scores: params[4],
              passed: params[5],
              reason: params[6],
              triggered_by: params[7],
              created_at: params[8],
            });
          }),
        };
      }
      if (sql.includes('ORDER BY') && sql.includes('LIMIT ?')) {
        return {
          all: vi.fn((limit: number) =>
            rows.slice(0, limit).reverse(),
          ),
        };
      }
      if (sql.includes('ORDER BY') && sql.includes('LIMIT 1')) {
        return {
          get: vi.fn(() => (rows.length > 0 ? rows[rows.length - 1] : undefined)),
        };
      }
      if (sql.includes('COUNT')) {
        return {
          get: vi.fn(() => ({ cnt: rows.length })),
        };
      }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
    }),
  };

  return { db, rows };
}

function makeEvent(overrides: Partial<RetrainingEvent> = {}): RetrainingEvent {
  return {
    id: 'evt-1',
    modelId: 'model-1',
    baseModel: 'test-model',
    pairCount: 50,
    evalScores: { accuracy: 0.85 },
    passed: true,
    reason: 'Eval gate passed',
    triggeredBy: 'auto',
    createdAt: new Date('2026-03-15T10:00:00Z'),
    ...overrides,
  };
}

describe('RetrainingHistory', () => {
  let mock: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mock = createMockDb();
  });

  it('creates the table on construction', () => {
    new RetrainingHistory(mock.db);
    expect(mock.db.exec).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS retraining_history'),
    );
  });

  it('records a retraining event', () => {
    const history = new RetrainingHistory(mock.db);
    const event = makeEvent();
    history.record(event);
    expect(mock.rows).toHaveLength(1);
    expect(mock.rows[0]!['base_model']).toBe('test-model');
  });

  it('returns null when no events exist', () => {
    const history = new RetrainingHistory(mock.db);
    const latest = history.getLatest();
    expect(latest).toBeNull();
  });

  it('returns Infinity hours when never trained', () => {
    const history = new RetrainingHistory(mock.db);
    expect(history.hoursSinceLastTraining()).toBe(Infinity);
  });

  it('counts events', () => {
    const history = new RetrainingHistory(mock.db);
    expect(history.count()).toBe(0);
  });
});
