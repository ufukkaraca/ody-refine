# Demo Corpus — Planted Contradiction Fixtures

Test fixtures simulating a real company's internal documentation with deliberately planted contradictions. Used for demoing Ody's contradiction detection capabilities.

## Files

| File | Description |
|------|-------------|
| `deployment-runbook.md` | Production deployment process — windows, approvals, rollback |
| `quick-start-guide.md` | New hire onboarding — setup, workflow, first deploy |
| `vacation-policy.md` | PTO allocation and remote work policy (People Ops) |
| `employee-handbook.md` | Company-wide handbook covering policies and benefits (HR) |
| `api-reference.md` | Platform API docs — auth, rate limits, endpoints |
| `developer-onboarding.md` | API integration guide for new developers |

## Expected Contradiction Findings

### 1. Deployment Process

- **deployment-runbook.md**: Deploys are restricted to Tuesday–Thursday, 2:00–4:00 PM UTC, and require 2 approvals from CODEOWNERS
- **quick-start-guide.md**: Says you can "deploy anytime using the Deploy button" with no mention of windows or dual approval

### 2. Vacation / PTO Allocation

- **vacation-policy.md**: 20 days PTO for 0–2 year tenure, 3 days remote per week
- **employee-handbook.md**: 15 days PTO for 0–3 year tenure, 2 days remote per week max

### 3. API Rate Limits & Token Expiry

- **api-reference.md**: Enterprise rate limit is 1,000 req/min; tokens expire in 24 hours
- **developer-onboarding.md**: Pro rate limit listed as 500 req/min (matches), but tokens described as expiring in 48 hours (contradicts api-reference)

## Design Notes

- Each file is 50–100 lines with realistic structure (headers, tables, code blocks)
- Contradictions are embedded in surrounding context — not isolated or obvious
- The corpus mimics a common real-world pattern: different teams authoring overlapping docs that drift out of sync over time
- Suitable for live demos, eval benchmarks, and integration tests
