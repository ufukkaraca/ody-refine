# New Hire Onboarding Guide

**Version:** 1.8
**Last updated:** 2024-03-10
**Owner:** Engineering

---

## Welcome to the Engineering Team

This guide walks you through your first 30 days as an engineer at Acme.
Complete each milestone to unlock the next one.

---

## Week 1: Setup

### Your First Day Checklist

1. Complete I-9 and tax forms via Gusto
2. Set up laptop using the IT setup guide (see #it-help in Slack)
3. Join #general, #engineering, and #people-ops on Slack
4. Schedule a 1:1 with your manager within the first 3 days
5. Complete security training (mandatory, due within 7 days)
6. Get access to GitHub, Datadog, and Linear from your manager
7. Read the Engineering Handbook before your first standup

### Development Environment

Clone the monorepo and run the bootstrap script:

```bash
git clone git@github.com:acme/monorepo.git
cd monorepo
./scripts/bootstrap.sh
```

This sets up your local database, installs dependencies, and runs the test
suite. If anything fails, post in #dev-setup.

---

## Week 2–4: Ramp Up

### First Contribution

Your manager will assign a "starter issue" labeled `good-first-issue` in Linear.
These are scoped to be completable in 1–3 days and come with a buddy reviewer.

**Goal:** Have your first PR merged by end of Week 2.

> **Note:** The onboarding buddy program launched in **Q2 2024** as a pilot.
> Final decision on whether to make it permanent was expected by **Q4 2024**.
> If you were assigned a buddy, great! If not, ask your manager.

### Architecture Deep Dive

Schedule 30-minute coffee chats with:
- Platform team lead (ask about the Kubernetes migration — we moved from ECS in 2024-09)
- Data team lead (ask about the analytics pipeline rebuild, completed Q3 2025)
- Security team (ask about the SOC 2 audit process)

---

## Month 2: Independence

By the end of your second month you should be able to:
- Pick up issues independently from the backlog
- Run your own code reviews
- Participate in on-call rotation (optional in Month 2, required in Month 3)

**30-day checklist complete by:** end of Q1 2026 for current cohort.

---

## Key Resources

| Resource | Location |
|----------|----------|
| Engineering Handbook | `/docs/engineering-handbook.md` |
| HR Policies | `/docs/hr-policies.md` |
| API Reference | `/docs/api-reference.md` |
| Architecture Decisions | `/docs/adrs/` |
| Runbooks | Notion → Engineering → Runbooks |

---

## Questions?

Post in #people-ops (HR questions) or #engineering-general (technical questions).
Your manager is always the right first stop.
