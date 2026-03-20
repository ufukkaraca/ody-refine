import { describe, it, expect } from 'vitest';
import { generateTickets, ticketsToMarkdown, ticketsToJson } from '../src/tickets.js';
import type { Detection } from '@useody/platform-core';

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    type: 'contradiction',
    severity: 'warning',
    nodeIds: ['a', 'b'],
    description: 'Test contradiction',
    ...overrides,
  };
}

describe('generateTickets', () => {
  it('generates tickets from all severity levels', () => {
    const detections: Detection[] = [
      makeDetection({ severity: 'critical', description: 'Critical issue' }),
      makeDetection({ severity: 'warning', description: 'Warning issue' }),
      makeDetection({ severity: 'info', description: 'Info issue' }),
    ];
    const tickets = generateTickets(detections);
    expect(tickets).toHaveLength(3);
  });

  it('maps severity to priority correctly', () => {
    const tickets = generateTickets([
      makeDetection({ severity: 'critical' }),
      makeDetection({ severity: 'warning' }),
    ]);
    expect(tickets[0]!.priority).toBe('urgent');
    expect(tickets[1]!.priority).toBe('high');
  });

  it('generates topic-based titles for contradictions', () => {
    const tickets = generateTickets([
      makeDetection({ metadata: { topic: 'rate limits' } }),
    ]);
    expect(tickets[0]!.title).toContain('rate limits');
  });

  it('generates deadline titles for time bombs', () => {
    const tickets = generateTickets([
      makeDetection({
        type: 'time_bomb',
        severity: 'warning',
        metadata: { deadline: 'Q3 2025' },
      }),
    ]);
    expect(tickets[0]!.title).toContain('Q3 2025');
  });

  it('generates topic-based titles for staleness findings', () => {
    const tickets = generateTickets([
      makeDetection({
        type: 'staleness',
        severity: 'warning',
        metadata: { topic: 'API versioning policy is 2 years old' },
      }),
    ]);
    expect(tickets[0]!.title).toContain('API versioning policy');
  });

  it('generates topic-based titles for duplicate findings', () => {
    const tickets = generateTickets([
      makeDetection({
        type: 'duplicate',
        severity: 'warning',
        metadata: { topic: 'Onboarding steps repeated in 3 docs' },
      }),
    ]);
    expect(tickets[0]!.title).toContain('Onboarding steps');
  });

  it('includes knowledge-integrity label', () => {
    const tickets = generateTickets([makeDetection()]);
    expect(tickets[0]!.labels).toContain('knowledge-integrity');
  });

  it('maps info severity to low priority', () => {
    const tickets = generateTickets([
      makeDetection({ severity: 'info' }),
    ]);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.priority).toBe('low');
  });

  it('returns empty for no detections', () => {
    const tickets = generateTickets([]);
    expect(tickets).toHaveLength(0);
  });
});

describe('ticketsToMarkdown', () => {
  it('generates markdown with priority sections', () => {
    const tickets = generateTickets([
      makeDetection({ severity: 'critical', description: 'Urgent fix' }),
      makeDetection({ severity: 'warning', description: 'High fix' }),
    ]);
    const md = ticketsToMarkdown(tickets);
    expect(md).toContain('# Knowledge Integrity');
    expect(md).toContain('## Urgent Priority');
    expect(md).toContain('## High Priority');
    expect(md).toContain('- [ ]');
  });

  it('does not truncate long descriptions', () => {
    const longDesc = 'API rate limit: 1,000/min (api-reference.md) vs 500/min (api-policy.md) — This creates risk of developers building integrations that exceed the actual enforced limit';
    const tickets = generateTickets([
      makeDetection({ severity: 'critical', description: longDesc }),
    ]);
    const md = ticketsToMarkdown(tickets);
    expect(md).toContain(longDesc);
  });

  it('preserves multi-line descriptions', () => {
    const tickets = generateTickets([
      makeDetection({
        severity: 'warning',
        description: 'First line of description',
        suggestedAction: 'Do something about it',
      }),
    ]);
    const md = ticketsToMarkdown(tickets);
    expect(md).toContain('First line of description');
    expect(md).toContain('Suggested action: Do something about it');
  });

  it('handles empty tickets gracefully', () => {
    const md = ticketsToMarkdown([]);
    expect(md).toContain('No actionable issues');
  });
});

describe('ticketsToJson', () => {
  it('produces valid JSON', () => {
    const tickets = generateTickets([makeDetection()]);
    const json = ticketsToJson(tickets);
    const parsed = JSON.parse(json) as unknown[];
    expect(parsed).toHaveLength(1);
  });
});
