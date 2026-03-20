# Acme Corp — Developer Quick Start Guide

Welcome to Acme Corp! This guide will get you from zero to productive in your first week. Follow the steps below and you'll be shipping code in no time.

## Day 1: Access & Setup

### Get Your Accounts

Your manager should have pre-provisioned the following. If anything is missing, ping #it-helpdesk:

- **GitHub**: You'll receive an invite to the `acme-corp` organization
- **Slack**: Join via the link in your welcome email
- **Datadog**: Access is granted automatically based on your GitHub team
- **AWS Console**: Read-only access by default; request elevated permissions through IT

### Set Up Your Local Environment

```bash
# Clone the monorepo
git clone git@github.com:acme-corp/platform.git
cd platform

# Install dependencies
make setup

# Verify everything works
make test
```

The `make setup` command installs all required tooling (Node.js, Docker, Terraform CLI) via our internal package manager. It takes about 15 minutes on a fresh machine.

### IDE Configuration

We recommend VS Code with the following extensions:

- ESLint (required)
- Prettier (required — formatting is enforced in CI)
- GitLens (recommended)
- Docker (recommended)

Import our shared settings: `cp .vscode/recommended-settings.json .vscode/settings.json`

## Day 2: Understanding the Architecture

Our platform consists of four core services:

1. **api-gateway** — Routes and authenticates all external requests
2. **user-service** — Manages accounts, profiles, and permissions
3. **billing-service** — Handles subscriptions, invoicing, and payments
4. **notification-service** — Email, SMS, and push notifications

All services communicate via an internal event bus (RabbitMQ) and expose REST APIs for synchronous operations.

### Key Directories

```
/services          — Individual microservices
/packages          — Shared libraries and types
/infrastructure    — Terraform modules
/scripts           — Build and deployment automation
```

## Day 3: Making Your First Change

1. Create a branch from `main`: `git checkout -b your-name/your-feature`
2. Make your changes and add tests
3. Run the test suite locally: `make test`
4. Open a PR against `main` — at least one approval is required
5. Once approved, merge via the GitHub UI

## Deploying Your Changes

Deploying at Acme is straightforward. Once your PR is merged to `main`, you can deploy anytime using the **Deploy** button in the CI/CD dashboard. Just navigate to the Pipelines page, find your commit, and hit "Deploy to Production."

The system handles the rest automatically — it runs integration tests, builds the containers, and rolls out the change. You'll see a green checkmark in Slack when it's live.

If something goes wrong, hit the "Rollback" button on the same page. It reverts to the previous version instantly.

### Tips for Smooth Deployments

- Keep PRs small and focused — easier to review and safer to deploy
- Use feature flags for anything user-facing so you can decouple deploy from release
- Watch the #deploys channel to avoid deploying at the same time as someone else
- If your change includes a database migration, give the team a heads-up in #engineering

## Day 4: Development Workflow

### Branch Strategy

- `main` is the production branch — always deployable
- Feature branches follow the pattern `name/description`
- We don't use long-lived development branches

### Code Review Norms

- Respond to review requests within 4 business hours
- Use "Request Changes" sparingly — prefer comments with suggestions
- Approve once your concerns are addressed; don't block on style nits

### Testing Requirements

- All new code must have unit tests (minimum 80% coverage for new files)
- Integration tests are required for any new API endpoint
- E2E tests are maintained by the QA team — coordinate via #qa

## Day 5: Getting Help

| Question | Where to Ask |
|----------|-------------|
| Setup issues | #it-helpdesk |
| Architecture questions | #engineering |
| CI/CD problems | #platform-eng |
| Code review | Tag `@reviewers` in your PR |
| General questions | Your onboarding buddy |

### Useful Links

- Internal wiki: https://wiki.acme-corp.internal
- API documentation: https://api-docs.acme-corp.internal
- Incident dashboard: https://status.acme-corp.internal
- On-call schedule: PagerDuty

Don't hesitate to ask questions — we were all new once. Welcome aboard!
