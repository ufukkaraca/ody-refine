import { describe, it, expect } from 'vitest';
import type { KnowledgeNode } from '@useody/platform-core';
import type { ConsultingFinding } from '@useody/detectors';
import { nodesToAnalysisInput, findingsToDetections } from '../src/detect/consultant-bridge.js';

function makeNode(overrides: Partial<KnowledgeNode> & { id: string; title: string }): KnowledgeNode {
  return {
    id: overrides.id,
    title: overrides.title,
    content: overrides.content ?? {
      summary: 'Test summary',
      raw: 'Raw content for testing.',
      source: { sourceType: 'file', sourceId: `docs/${overrides.id}.md` },
    },
    embedding: [],
    embeddingModel: 'test',
    embeddingDim: 384,
    confidence: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeFinding(overrides: Partial<ConsultingFinding>): ConsultingFinding {
  return {
    category: 'contradiction',
    severity: 'critical',
    headline: 'Test headline',
    evidence: [],
    businessImpact: 'Test impact',
    recommendation: 'Fix it',
    effort: 'quick_win',
    affectedDocuments: [],
    ...overrides,
  };
}

describe('nodesToAnalysisInput', () => {
  it('converts nodes to analysis input with paths from source', () => {
    const nodes = [
      makeNode({ id: 'n1', title: 'Handbook' }),
      makeNode({ id: 'n2', title: 'Runbook' }),
    ];
    const input = nodesToAnalysisInput(nodes);
    expect(input.documents).toHaveLength(2);
    expect(input.documents[0]!.path).toBe('n1.md');
    expect(input.documents[0]!.title).toBe('Handbook');
    expect(input.documents[0]!.content).toBe('Raw content for testing.');
  });

  it('falls back to summary when no raw content', () => {
    const node = makeNode({ id: 'n1', title: 'Doc' });
    node.content.raw = undefined;
    const input = nodesToAnalysisInput([node]);
    expect(input.documents[0]!.content).toBe('Test summary');
  });

  it('includes lastModified when source has it', () => {
    const node = makeNode({ id: 'n1', title: 'Doc' });
    node.content.source!.lastModified = new Date('2025-06-15T10:00:00Z');
    const input = nodesToAnalysisInput([node]);
    expect(input.documents[0]!.lastModified).toBe('2025-06-15');
  });

  it('uses node id as path when no source', () => {
    const node = makeNode({ id: 'abc-123', title: 'Orphan' });
    node.content.source = undefined;
    const input = nodesToAnalysisInput([node]);
    expect(input.documents[0]!.path).toBe('abc-123');
  });
});

describe('findingsToDetections', () => {
  const nodes = [
    makeNode({ id: 'n1', title: 'Handbook' }),
    makeNode({ id: 'n2', title: 'Runbook' }),
  ];

  it('maps contradiction category to contradiction type', () => {
    const findings = [makeFinding({
      category: 'contradiction',
      affectedDocuments: ['docs/n1.md', 'docs/n2.md'],
    })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets).toHaveLength(1);
    expect(dets[0]!.type).toBe('contradiction');
    expect(dets[0]!.nodeIds).toEqual(['n1', 'n2']);
  });

  it('maps stale_commitment to staleness', () => {
    const findings = [makeFinding({ category: 'stale_commitment' })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.type).toBe('staleness');
  });

  it('maps ownership_gap to undocumented', () => {
    const findings = [makeFinding({ category: 'ownership_gap' })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.type).toBe('undocumented');
  });

  it('maps tribal_knowledge to time_bomb', () => {
    const findings = [makeFinding({ category: 'tribal_knowledge' })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.type).toBe('time_bomb');
  });

  it('maps duplicate_truth to duplicate', () => {
    const findings = [makeFinding({ category: 'duplicate_truth' })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.type).toBe('duplicate');
  });

  it('maps commitment_without_followthrough to staleness', () => {
    const findings = [makeFinding({ category: 'commitment_without_followthrough' })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.type).toBe('staleness');
  });

  it('maps decision_without_context to undocumented', () => {
    const findings = [makeFinding({ category: 'decision_without_context' })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.type).toBe('undocumented');
  });

  it('preserves consultant category in metadata', () => {
    const findings = [makeFinding({
      category: 'tribal_knowledge',
      effort: 'major',
    })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.metadata?.['consultantCategory']).toBe('tribal_knowledge');
    expect(dets[0]!.metadata?.['effort']).toBe('major');
  });

  it('builds description from headline and impact', () => {
    const findings = [makeFinding({
      headline: 'Deploy schedule conflicts',
      businessImpact: 'This creates risk of ops confusion.',
    })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.description).toContain('Deploy schedule conflicts');
    expect(dets[0]!.description).toContain('ops confusion');
  });

  it('falls back to evidence sources for nodeIds', () => {
    const findings = [makeFinding({
      affectedDocuments: [],
      evidence: [{ source: 'docs/n1.md', quote: 'Some quote' }],
    })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.nodeIds).toEqual(['n1']);
  });

  it('sets suggestedAction from recommendation', () => {
    const findings = [makeFinding({ recommendation: 'Consolidate docs.' })];
    const dets = findingsToDetections(findings, nodes);
    expect(dets[0]!.suggestedAction).toBe('Consolidate docs.');
  });
});
