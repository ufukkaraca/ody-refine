# Sample Docs — ody-refine Demo

This directory contains a small set of realistic company docs designed to
showcase all five ody-refine detectors.

## Try it

```bash
npx ody-refine ./examples/sample-docs/
```

Or if you've already built the repo:

```bash
node apps/refine/dist/cli.js ingest ./examples/sample-docs/
```

## What you'll see

These docs deliberately contain real-world documentation problems:

| Detector      | What's hidden here |
|---------------|--------------------|
| Contradiction | API rate limit is 1,000/min in one doc, 500/min in another |
| Contradiction | PTO policy disagrees across HR docs (20 days vs 15 days) |
| Duplicate     | Onboarding checklist appears in two documents |
| Staleness     | `api-reference.md` predates the breaking changes in `api-policy.md` |
| Time Bomb     | Deprecation deadlines in the past (Q3 2025, 2024-09) |
| Time Bomb     | Q1 2026 migration window is approaching |

Expected health score: **~60–70** (needs attention, not catastrophic).

## The files

- `api-reference.md` — External API docs with rate limits and auth details
- `api-policy.md` — Internal API governance (conflicts with reference!)
- `employee-handbook.md` — HR policies, PTO, remote work
- `hr-policies.md` — HR policy supplement (conflicts on PTO days)
- `onboarding-guide.md` — New hire onboarding (duplicate content + missed milestones)
