/**
 * Unit tests for heuristic edge reasoning.
 */
import { describe, it, expect } from 'vitest';
import type { KnowledgeNode } from '@useody/platform-core';
import {
  extractNumbers,
  detectNumberContradiction,
  detectNegation,
  detectTemporalSupersession,
  extractDates,
} from '../src/ingest/reason-edges.js';

/** Helper to create a minimal KnowledgeNode for testing. */
function makeNode(
  id: string,
  title: string,
  raw: string,
): KnowledgeNode {
  return {
    id,
    title,
    content: { summary: raw.slice(0, 200), raw },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 4,
    confidence: 1.0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('extractNumbers', () => {
  it('extracts rate limit numbers', () => {
    const nums = extractNumbers('Rate limited to 1000 requests per minute');
    expect(nums.length).toBeGreaterThanOrEqual(1);
    expect(nums.some((n) => n.value === 1000)).toBe(true);
  });

  it('extracts dollar amounts', () => {
    const nums = extractNumbers('Team lunches up to $25 can be expensed');
    expect(nums.some((n) => n.value === 25)).toBe(true);
  });

  it('extracts percentages', () => {
    const nums = extractNumbers('We achieved 99.9% uptime');
    expect(nums.some((n) => n.value === 99.9)).toBe(true);
  });
});

describe('detectNumberContradiction', () => {
  it('detects rate limit contradiction (1000 vs 500)', () => {
    const a = makeNode(
      'a', 'API Rate Limiting',
      'All API endpoints are rate limited to 1000 requests per minute per API key.',
    );
    const b = makeNode(
      'b', 'Developer Handbook',
      'Our API supports 500 requests per minute per key.',
    );

    const result = detectNumberContradiction(a, b);
    expect(result.contradicts).toBe(true);
    expect(result.reason).toContain('1000');
    expect(result.reason).toContain('500');
  });

  it('does not flag same numbers', () => {
    const a = makeNode('a', 'Doc A', 'Rate limit: 1000 requests per minute');
    const b = makeNode('b', 'Doc B', 'Rate limit: 1000 requests per minute');

    const result = detectNumberContradiction(a, b);
    expect(result.contradicts).toBe(false);
  });

  it('detects expense limit contradiction ($25 vs $50)', () => {
    const a = makeNode(
      'a', 'Company Policy',
      'Expense policy: team lunches up to $25 per person can be submitted without expense approval.',
    );
    const b = makeNode(
      'b', 'Onboarding Guide',
      'Expense policy: anything over $50 per person requires expense approval from your manager.',
    );

    const result = detectNumberContradiction(a, b);
    expect(result.contradicts).toBe(true);
  });
});

describe('detectNegation', () => {
  it('detects remote-first vs office contradiction', () => {
    const a = makeNode(
      'a', 'Developer Handbook',
      'Acme is a remote-first company. All team meetings are on Zoom.',
    );
    const b = makeNode(
      'b', 'Company Policy',
      'All employees are expected to work from the San Francisco office Monday through Friday.',
    );

    const result = detectNegation(a, b);
    expect(result.contradicts).toBe(true);
    expect(result.reason).toContain('remote');
    expect(result.reason).toContain('office');
  });

  it('does not flag unrelated content', () => {
    const a = makeNode('a', 'API', 'REST endpoints with JSON responses.');
    const b = makeNode('b', 'Deploy', 'Docker containers on AWS ECS.');

    const result = detectNegation(a, b);
    expect(result.contradicts).toBe(false);
  });
});

describe('extractDates', () => {
  it('extracts quarter references', () => {
    const dates = extractDates('Target launch Q2 2025 with deprecation by Q4 2025.');
    expect(dates.length).toBe(2);
  });

  it('extracts month-year dates', () => {
    const dates = extractDates('Last updated: January 2026');
    expect(dates.length).toBe(1);
  });
});

describe('detectTemporalSupersession', () => {
  it('detects newer document superseding older', () => {
    const a = makeNode(
      'a', 'Original Plan',
      'We are evaluating gRPC for internal services. Decision pending until Q3 2025.',
    );
    const b = makeNode(
      'b', 'Updated Plan',
      'We completed the gRPC migration in Q1 2026. All services now use gRPC.',
    );

    const result = detectTemporalSupersession(a, b);
    expect(result.supersedes).toBe(true);
    expect(result.newerId).toBe('b');
    expect(result.olderId).toBe('a');
  });

  it('does not flag nodes without dates', () => {
    const a = makeNode('a', 'Doc A', 'REST API endpoints.');
    const b = makeNode('b', 'Doc B', 'GraphQL schema definition.');

    const result = detectTemporalSupersession(a, b);
    expect(result.supersedes).toBe(false);
  });

  it('does not flag sibling sections from the same source', () => {
    const a: KnowledgeNode = {
      ...makeNode('a', 'Industry Reports Timeline',
        'Gartner (Dec 2025). McKinsey (Mar 2026). Forrester (Jan 2026).'),
      content: {
        summary: 'Three major industry reports',
        raw: 'Gartner (Dec 2025). McKinsey (Mar 2026). Forrester (Jan 2026).',
        source: { sourceType: 'md', sourceId: '/docs/market-research.md' },
      },
    };
    const b: KnowledgeNode = {
      ...makeNode('b', 'Other Industry Reports',
        'Forrester — Services (Mar 5, 2026). IDC (Feb 2026).'),
      content: {
        summary: 'Additional industry reports',
        raw: 'Forrester — Services (Mar 5, 2026). IDC (Feb 2026).',
        source: { sourceType: 'md', sourceId: '/docs/market-research.md' },
      },
    };

    const result = detectTemporalSupersession(a, b);
    expect(result.supersedes).toBe(false);
  });
});

describe('detectNumberContradiction — false positive prevention', () => {
  it('does not flag when both numbers appear in both contexts', () => {
    // "$2M budget at $15M target" — both nodes say the same thing
    const a = makeNode(
      'a', 'Business Context',
      'Allocating $2M for expansion, $15M projected revenue target',
    );
    const b = makeNode(
      'b', 'Budget Plan',
      '$2M expansion budget at $15M revenue target',
    );

    const result = detectNumberContradiction(a, b);
    expect(result.contradicts).toBe(false);
  });

  it('still flags when numbers genuinely differ in same context', () => {
    const a = makeNode(
      'a', 'API Rate Limiting',
      'All API endpoints are rate limited to 1000 requests per minute per API key.',
    );
    const b = makeNode(
      'b', 'Developer Handbook',
      'Our API supports 500 requests per minute per key.',
    );

    const result = detectNumberContradiction(a, b);
    expect(result.contradicts).toBe(true);
  });
});
