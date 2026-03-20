# Production Deployment Runbook

**Last updated:** 2025-11-14
**Owner:** Platform Engineering
**Applies to:** All production services (api-gateway, user-service, billing-service, notification-service)

## Overview

This document describes the standard deployment process for all production services at Acme Corp. All engineers are expected to follow this process without exception. Deviations require VP-level approval and must be documented in the #incidents Slack channel.

## Deployment Windows

Production deployments are permitted during the following times only:

- **Tuesday through Thursday**, between **2:00 PM and 4:00 PM UTC**
- No deployments on Mondays (reserved for sprint planning and post-weekend triage)
- No deployments on Fridays (to avoid weekend on-call escalations)
- Holiday freeze periods are announced in #engineering-announcements at least 2 weeks in advance

Emergency hotfixes may be deployed outside these windows with explicit approval from the on-call lead and one additional senior engineer.

## Pre-Deployment Checklist

Before initiating any deployment, the deploying engineer must verify:

1. All CI checks pass on the release branch (green pipeline required)
2. The changeset has been reviewed and **approved by at least two engineers**, one of whom must be a code owner for the affected service
3. The deployment has been announced in #deploys at least 30 minutes before the window opens
4. Database migrations, if any, have been tested against a staging snapshot
5. Rollback plan has been documented in the deployment PR description
6. Feature flags for new functionality are defaulted to OFF

## Deployment Process

### Step 1: Tag the Release

```bash
git tag -a v$(date +%Y%m%d.%H%M) -m "Production release"
git push origin --tags
```

### Step 2: Trigger the Pipeline

Navigate to the CI/CD dashboard and select "Deploy to Production" for the tagged commit. The pipeline will:

- Run the full integration test suite (~8 minutes)
- Build production Docker images
- Push images to our private registry
- Wait for manual approval gate

### Step 3: Approve the Deployment

The deployment requires **two approvals** in the CI/CD dashboard:

1. The deploying engineer confirms the deployment
2. A second engineer (reviewer or on-call) provides the second approval

Both approvals must come from engineers listed in the CODEOWNERS file for the affected service.

### Step 4: Monitor the Rollout

After approval, the deployment proceeds as a rolling update:

- Canary phase: 5% of traffic for 10 minutes
- Gradual rollout: 25% → 50% → 100% over 30 minutes
- Automatic rollback triggers if error rate exceeds 1% or p99 latency exceeds 500ms

### Step 5: Post-Deployment Verification

- Check Datadog dashboards for the deployed service
- Verify health check endpoints return 200
- Run the smoke test suite: `make smoke-test ENV=production`
- Confirm no new errors in Sentry for 15 minutes

## Rollback Procedure

If issues are detected after deployment:

1. Click "Rollback" in the CI/CD dashboard (reverts to previous image)
2. Notify #incidents with a brief description
3. The rollback does not require additional approvals
4. File a post-mortem if the deployment caused user-visible impact

## Contacts

| Role | Person | Slack |
|------|--------|-------|
| Platform Lead | Sarah Chen | @sarah.chen |
| On-call rotation | See PagerDuty | #oncall |
| Release Manager | Marcus Webb | @marcus.webb |

## Appendix: Service-Specific Notes

- **api-gateway**: Requires cache warm-up after deploy. Run `make warm-cache` post-deployment.
- **billing-service**: Coordinate with Finance if deploying during month-end (25th-31st).
- **notification-service**: Deployments may delay queued notifications by up to 2 minutes during rollout.
