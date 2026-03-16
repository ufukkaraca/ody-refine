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
  it('generates tickets from warning and critical detections', () => {
    const detections: Detection[] = [
      makeDetection({ severity: 'critical', description: 'Critical issue' }),
      makeDetection({ severity: 'warning', description: 'Warning issue' }),
      makeDetection({ severity: 'info', description: 'Info issue' }),
    ];
    const tickets = generateTickets(detections);
    expect(tickets).toHaveLength(2); // critical + warning, not info
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

  it('includes knowledge-integrity label', () => {
    const tickets = generateTickets([makeDetection()]);
    expect(tickets[0]!.labels).toContain('knowledge-integrity');
  });

  it('returns empty for no actionable findings', () => {
    const tickets = generateTickets([
      makeDetection({ severity: 'info' }),
    ]);
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
