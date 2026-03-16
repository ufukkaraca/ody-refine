/**
 * Generate actionable tickets from detections.
 * Output: markdown task list or JSON for Jira/Linear import.
 * @module tickets
 */
import type { Detection } from '@useody/platform-core';

/** A single actionable ticket generated from a detection. */
export interface Ticket {
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  labels: string[];
  affectedFiles: string[];
}

/** Map severity to ticket priority. */
function toPriority(severity: string): Ticket['priority'] {
  if (severity === 'critical') return 'urgent';
  if (severity === 'warning') return 'high';
  return 'medium';
}

/** Extract file names from detection metadata. */
function getFiles(d: Detection): string[] {
  const nodes = d.metadata?.['nodes'];
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((n: { source?: string | null }) => n.source)
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.split('/').pop() ?? s);
}

/** Generate a human-readable ticket title. */
function generateTitle(d: Detection): string {
  const meta = d.metadata ?? {};
  const topic = typeof meta['topic'] === 'string' ? meta['topic'] : null;

  if (d.type === 'contradiction' && topic) {
    return `Fix contradiction: ${topic}`;
  }
  if (d.type === 'contradiction') {
    const claimA = meta['claimA'];
    const claimB = meta['claimB'];
    if (typeof claimA === 'string' && typeof claimB === 'string') {
      return `Resolve: "${claimA.slice(0, 40)}" vs "${claimB.slice(0, 40)}"`;
    }
  }
  if (d.type === 'time_bomb') {
    const deadline = meta['deadline'];
    return typeof deadline === 'string'
      ? `Update expired deadline: ${deadline}`
      : 'Review date-dependent content';
  }
  if (d.type === 'staleness') return 'Update outdated documentation';
  if (d.type === 'duplicate') return 'Consolidate duplicate content';
  return `Review: ${d.description.slice(0, 60)}`;
}

/**
 * Generate actionable tickets from detections.
 * Only generates tickets for warning and critical findings.
 */
export function generateTickets(detections: Detection[]): Ticket[] {
  return detections
    .filter((d) => d.severity === 'critical' || d.severity === 'warning')
    .map((d) => ({
      title: generateTitle(d),
      description: d.description + (d.suggestedAction ? `\n\nSuggested action: ${d.suggestedAction}` : ''),
      priority: toPriority(d.severity),
      labels: [d.type, 'knowledge-integrity'],
      affectedFiles: getFiles(d),
    }));
}

/** Export tickets as a markdown task list. */
export function ticketsToMarkdown(tickets: Ticket[]): string {
  if (tickets.length === 0) return 'No actionable issues found.\n';

  const lines: string[] = ['# Knowledge Integrity — Action Items\n'];
  const byPriority = { urgent: [] as Ticket[], high: [] as Ticket[], medium: [] as Ticket[], low: [] as Ticket[] };
  for (const t of tickets) byPriority[t.priority].push(t);

  for (const [priority, items] of Object.entries(byPriority)) {
    if (items.length === 0) continue;
    lines.push(`## ${priority.charAt(0).toUpperCase() + priority.slice(1)} Priority\n`);
    for (const t of items) {
      const files = t.affectedFiles.length > 0
        ? ` (${t.affectedFiles.join(', ')})`
        : '';
      lines.push(`- [ ] **${t.title}**${files}`);
      lines.push(`  ${t.description.split('\n')[0]!.slice(0, 120)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/** Export tickets as JSON for Linear/Jira import. */
export function ticketsToJson(tickets: Ticket[]): string {
  return JSON.stringify(tickets, null, 2);
}
