// EXCEEDS_LIMIT: comprehensive test fixture with 10 realistic findings across 7 categories
import { describe, it, expect } from 'vitest';
import { generateConsultingReport } from '../src/consulting-report.js';
import type { AnalysisResult, ConsultingFinding } from '../src/consulting-types.js';

/** Realistic mock analysis result with all 7 categories. */
function mockResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    healthScore: { overall: 62, consistency: 45, freshness: 70, ownership: 55, coverage: 78 },
    documentMap: [
      { path: 'docs/api-reference.md', title: 'API Reference', topics: ['API', 'Rate Limits', 'Auth'], lastModified: '2025-11-01', owner: 'eng-team' },
      { path: 'docs/ops-runbook.md', title: 'Operations Runbook', topics: ['Deployment', 'Rate Limits', 'Monitoring'], lastModified: '2025-06-15' },
      { path: 'docs/onboarding.md', title: 'Onboarding Guide', topics: ['Setup', 'Auth', 'Getting Started'], lastModified: '2024-08-20' },
      { path: 'docs/sla-commitments.md', title: 'SLA Commitments', topics: ['SLA', 'Response Times', 'Uptime'], lastModified: '2025-09-10', owner: 'customer-success' },
      { path: 'docs/architecture.md', title: 'Architecture Overview', topics: ['Infra', 'Deployment', 'API'], lastModified: '2025-12-01', owner: 'eng-team' },
      { path: 'docs/incident-response.md', title: 'Incident Response', topics: ['Incidents', 'Deployment', 'Escalation'], lastModified: '2025-10-05' },
    ],
    findings: [
      // 1. Contradiction (critical)
      { category: 'contradiction', severity: 'critical', headline: 'Rate limit policy mismatch between API docs and ops runbook',
        evidence: [{ source: 'docs/api-reference.md', quote: 'Rate limit is 500 requests per minute per API key' }, { source: 'docs/ops-runbook.md', quote: 'Rate limiting is configured at 1,000 requests per minute' }],
        businessImpact: 'A team following the wrong version could breach contract terms or cause unnecessary throttling.',
        recommendation: 'Reconcile the rate limit values. Verify the actual production configuration and update both documents.', effort: 'quick_win', affectedDocuments: ['docs/api-reference.md', 'docs/ops-runbook.md'] },
      // 2. Contradiction (warning)
      { category: 'contradiction', severity: 'warning', headline: 'Deployment process disagrees on hotfix policy',
        evidence: [{ source: 'docs/architecture.md', quote: 'All deployments must pass through staging environment' }, { source: 'docs/incident-response.md', quote: 'Critical hotfixes may be deployed directly to production' }],
        businessImpact: 'During an incident, teams may hesitate or follow conflicting procedures.',
        recommendation: 'Define a clear hotfix exception policy and reference it from both documents.', effort: 'medium', affectedDocuments: ['docs/architecture.md', 'docs/incident-response.md'] },
      // 3. Stale commitment (critical)
      { category: 'stale_commitment', severity: 'critical', headline: 'SLA response time commitment may not reflect current capacity',
        evidence: [{ source: 'docs/sla-commitments.md', quote: '99.9% uptime guarantee with 15-minute response time for P1 incidents' }],
        businessImpact: 'If the team cannot actually meet this SLA, the company faces contractual liability.',
        recommendation: 'Review current incident response metrics against the published SLA. Update or add caveats.', effort: 'quick_win', affectedDocuments: ['docs/sla-commitments.md'] },
      // 4. Ownership gap (warning)
      { category: 'ownership_gap', severity: 'warning', headline: 'Operations runbook has no designated owner',
        evidence: [{ source: 'docs/ops-runbook.md', quote: '(no owner metadata found)' }],
        businessImpact: 'Without an owner, this document will drift from reality with no one accountable for updates.',
        recommendation: 'Assign an owner from the platform team. Add an ownership header to the document.', effort: 'quick_win', affectedDocuments: ['docs/ops-runbook.md'] },
      // 5. Tribal knowledge (warning)
      { category: 'tribal_knowledge', severity: 'warning', headline: 'Escalation procedures exist in only one document',
        evidence: [{ source: 'docs/incident-response.md', quote: 'Escalate to VP Engineering if P1 not resolved within 30 minutes' }],
        businessImpact: 'If the incident response doc is outdated or inaccessible, critical escalation paths are lost.',
        recommendation: 'Cross-reference escalation procedures in the ops runbook and onboarding guide.', effort: 'medium', affectedDocuments: ['docs/incident-response.md'] },
      // 6. Duplicate truth (info)
      { category: 'duplicate_truth', severity: 'info', headline: 'Authentication setup documented in two places with different detail levels',
        evidence: [{ source: 'docs/api-reference.md', quote: 'Authentication uses OAuth 2.0 with JWT tokens' }, { source: 'docs/onboarding.md', quote: 'Set up auth by generating an API key in the dashboard' }],
        businessImpact: 'New team members may follow the simpler guide and miss security requirements.',
        recommendation: 'Consolidate into the API reference and link from onboarding.', effort: 'medium', affectedDocuments: ['docs/api-reference.md', 'docs/onboarding.md'] },
      // 7. Commitment without follow-through (warning)
      { category: 'commitment_without_followthrough', severity: 'warning', headline: 'Quarterly security review commitment has no evidence of completion',
        evidence: [{ source: 'docs/sla-commitments.md', quote: 'We conduct quarterly security reviews of all customer-facing systems' }],
        businessImpact: 'If auditors or customers ask for evidence, the company cannot demonstrate compliance.',
        recommendation: 'Either document completed reviews or update the commitment to reflect actual cadence.', effort: 'major', affectedDocuments: ['docs/sla-commitments.md'] },
      // 8. Decision without context (info)
      { category: 'decision_without_context', severity: 'info', headline: 'Architecture decision to use microservices lacks documented rationale',
        evidence: [{ source: 'docs/architecture.md', quote: 'The system uses a microservices architecture' }],
        businessImpact: 'New engineers cannot understand why decisions were made, leading to uninformed changes.',
        recommendation: 'Add an ADR (Architecture Decision Record) explaining the microservices choice.', effort: 'medium', affectedDocuments: ['docs/architecture.md'] },
      // 9. Stale commitment (info)
      { category: 'stale_commitment', severity: 'info', headline: 'Onboarding guide references deprecated setup steps',
        evidence: [{ source: 'docs/onboarding.md', quote: 'Run make setup to initialize your local environment' }],
        businessImpact: 'New hires waste time on broken setup procedures.',
        recommendation: 'Update to reflect current setup tooling.', effort: 'quick_win', affectedDocuments: ['docs/onboarding.md'] },
      // 10. Contradiction (critical)
      { category: 'contradiction', severity: 'critical', headline: 'Customer-facing SLA contains three conflicting response time commitments',
        evidence: [{ source: 'docs/sla-commitments.md', quote: '15-minute response time for P1 incidents' }, { source: 'docs/ops-runbook.md', quote: 'Target response time: 30 minutes for all severity levels' }],
        businessImpact: 'A team following the wrong version could breach contract terms.',
        recommendation: 'Align SLA and runbook on response time targets. The SLA is customer-facing and must be authoritative.', effort: 'quick_win', affectedDocuments: ['docs/sla-commitments.md', 'docs/ops-runbook.md'] },
    ] as ConsultingFinding[],
    metadata: { analyzedAt: '2026-03-16T14:30:00Z', documentCount: 6, totalTokens: 12500, modelUsed: 'claude-sonnet-4-5-20250514' },
    ...overrides,
  };
}

describe('generateConsultingReport', () => {
  it('produces valid HTML with DOCTYPE', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
  });

  it('uses Knowledge Health Assessment title', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('Knowledge Health Assessment');
    expect(html).toContain('Ody Refine');
  });

  it('shows the health score gauge', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('>62<');
    expect(html).toContain('OUT OF 100');
  });

  it('renders the radar chart with all 4 dimensions', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('Consistency');
    expect(html).toContain('Freshness');
    expect(html).toContain('Ownership');
    expect(html).toContain('Coverage');
    expect(html).toContain('>45<'); // consistency score
    expect(html).toContain('>78<'); // coverage score
  });

  it('renders the ghost-slide executive summary', () => {
    const html = generateConsultingReport(mockResult());
    // Should lead with the most impactful finding, not a generic "we found N issues"
    expect(html).toContain('ghost-slide');
    // Should not start with "We analyzed..."
    expect(html).not.toMatch(/class="ghost-slide">We analyzed/);
  });

  it('renders findings grouped by all 7 categories', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('Contradictions');
    expect(html).toContain('Stale Commitments');
    expect(html).toContain('Ownership Gaps');
    expect(html).toContain('Tribal Knowledge');
    expect(html).toContain('Duplicate Truth');
    expect(html).toContain('Commitments Without Follow-Through');
    expect(html).toContain('Decisions Without Context');
  });

  it('renders category narrative intros', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('category-intro');
    // Contradiction group should mention disagreement
    expect(html).toContain('disagreement');
  });

  it('renders evidence quotes side-by-side', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('evidence-pair');
    expect(html).toContain('500 requests per minute');
    expect(html).toContain('1,000 requests per minute');
    expect(html).toContain('VS');
  });

  it('renders business impact and recommendation', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('why-it-matters');
    expect(html).toContain('finding-recommendation');
    expect(html).toContain('Recommendation:');
    expect(html).toContain('breach contract terms');
  });

  it('renders effort badges', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('Quick Win');
    expect(html).toContain('Medium Effort');
    expect(html).toContain('Major Project');
  });

  it('renders the action plan sorted by effort', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('action-list');
    expect(html).toContain('action-item');
    // Quick wins should appear in the action plan
    expect(html).toContain('Recommended Actions');
  });

  it('renders the knowledge coverage heatmap', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('Knowledge Coverage Map');
    expect(html).toContain('heatmap-cell');
    expect(html).toContain('Rate Limits');
    expect(html).toContain('Deployment');
    // Under-documented topics should be flagged as thin
    expect(html).toContain('heatmap-cell thin');
    // Legend should be present
    expect(html).toContain('Well-covered');
    expect(html).toContain('Under-documented');
  });

  it('renders the methodology note', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('How This Analysis Was Performed');
    expect(html).toContain('6 documents');
    expect(html).toContain('claude-sonnet');
  });

  it('escapes HTML in finding content', () => {
    const xss: ConsultingFinding = {
      category: 'contradiction', severity: 'critical',
      headline: '<script>alert("xss")</script>',
      evidence: [{ source: 'a.md', quote: '<img onerror="alert(1)">' }],
      businessImpact: 'test', recommendation: 'fix', effort: 'quick_win', affectedDocuments: [],
    };
    const result = mockResult({ findings: [xss] });
    const html = generateConsultingReport(result);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders empty state for zero findings', () => {
    const result = mockResult({ findings: [] });
    const html = generateConsultingReport(result);
    expect(html).toContain('No issues found');
    expect(html).toContain('Knowledge Health Assessment');
  });

  it('is fully self-contained with no external CDN dependencies', () => {
    const html = generateConsultingReport(mockResult());
    // Must not include Google Fonts or any CDN link tags
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
    // Only social share URLs and SVG namespaces are allowed as external URLs
    const externalLinks = html.match(/https?:\/\/[^"'\s)]+/g) ?? [];
    const unexpected = externalLinks.filter((u) =>
      !u.includes('x.com') && !u.includes('linkedin.com')
      && !u.includes('github.com') && !u.includes('w3.org'));
    expect(unexpected).toEqual([]);
  });

  it('renders the share section with social links and badge', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('share-section');
    expect(html).toContain('Post on X');
    expect(html).toContain('Share on LinkedIn');
    expect(html).toContain('badge-section');
    expect(html).toContain('badge-code');
  });

  it('renders verdict line in executive summary', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('verdict-line');
  });

  it('renders Why this matters callouts', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('why-it-matters');
    expect(html).toContain('Why this matters:');
  });

  it('renders Claim A / Claim B labels for contradictions', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('Claim A');
    expect(html).toContain('Claim B');
  });

  it('renders category icons', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('category-icon');
  });

  it('renders ROI banner in action plan', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('roi-banner');
    expect(html).toContain('quick win');
  });

  it('renders CSS animations', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('score-arc-animated');
    expect(html).toContain('radar-polygon');
    expect(html).toContain('fade-up');
    expect(html).toContain('@keyframes');
  });

  it('renders severity badges correctly', () => {
    const html = generateConsultingReport(mockResult());
    expect(html).toContain('sev-badge critical');
    expect(html).toContain('sev-badge warning');
    expect(html).toContain('sev-badge info');
  });
});
