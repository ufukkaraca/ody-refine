# Integration Testing for Connectors

The unit tests in `__tests__/*.test.ts` mock every API call. They verify parsing
logic, conversion helpers, and error handling -- but they cannot prove that a
connector actually works against a live service.

The **integration smoke tests** in `__tests__/integration/connector-smoke.test.ts`
fill that gap. They call `authenticate()`, `listSources()`, and `fetchDocuments()`
against real APIs using sandbox or test-account credentials.

## Running integration tests

Pass the relevant env vars, then run only the `integration/` directory:

```bash
# Single connector
NOTION_API_KEY=ntn_xxx \
  pnpm --filter ody-refine test -- integration/

# Multiple connectors at once
NOTION_API_KEY=ntn_xxx \
LINEAR_API_KEY=lin_api_xxx \
SLACK_BOT_TOKEN=xoxb-xxx \
  pnpm --filter ody-refine test -- integration/

# Confluence (requires 3 vars)
CONFLUENCE_URL=https://yoursite.atlassian.net \
CONFLUENCE_EMAIL=you@example.com \
CONFLUENCE_API_TOKEN=xxx \
  pnpm --filter ody-refine test -- integration/

# Jira (requires 3 vars)
JIRA_URL=https://yoursite.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=xxx \
  pnpm --filter ody-refine test -- integration/

# Microsoft Teams
TEAMS_ACCESS_TOKEN=eyJ... \
  pnpm --filter ody-refine test -- integration/
```

When an env var is missing the corresponding `describe` block is skipped via
`describe.skipIf`, so running without any keys is safe -- all suites skip and
the test run exits 0.

## Required env vars per connector

| Connector   | Env vars                                                  |
|-------------|-----------------------------------------------------------|
| Notion      | `NOTION_API_KEY`                                          |
| Linear      | `LINEAR_API_KEY`                                          |
| Slack       | `SLACK_BOT_TOKEN`                                         |
| Confluence  | `CONFLUENCE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN` |
| Jira        | `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`                |
| Teams       | `TEAMS_ACCESS_TOKEN`                                      |

## What the tests verify

1. **Authentication** -- `authenticate()` succeeds with the provided credentials.
2. **Validation** -- `validate()` returns `true` after authentication.
3. **Source discovery** -- `listSources()` returns at least one source with
   valid `id`, `name`, and `type` fields.
4. **Document fetching** -- `fetchDocuments()` for the first source yields
   documents conforming to the `ConnectorDocument` interface (correct `id`,
   `title`, `content`, `sourceType`, `metadata`).

Each connector suite has a **30-second timeout** to account for network latency.

## Sandbox account setup tips

- **Notion**: Create a test integration at https://notion.so/my-integrations.
  Share at least one page/database with the integration.
- **Linear**: Generate a personal API key at https://linear.app/settings/api.
  Ensure the workspace has at least one team with issues.
- **Slack**: Create a test app at https://api.slack.com/apps with
  `channels:history`, `channels:read`, `chat:write`, `users:read` scopes.
  Install to a test workspace and invite the bot to at least one channel.
- **Confluence / Jira**: Generate an API token at
  https://id.atlassian.com/manage-profile/security/api-tokens. Use your
  Atlassian site URL (e.g., `https://yoursite.atlassian.net`).
- **Teams**: Requires an OAuth access token with Microsoft Graph permissions
  (`Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`).

## CI usage

In CI, set the secrets as environment variables. The tests run as part of the
normal `pnpm test` suite but skip when keys are absent, so they add zero
overhead to PRs that don't configure secrets.

For a dedicated integration-test job:

```yaml
# .github/workflows/integration.yml
name: Integration Tests
on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6 AM UTC
  workflow_dispatch: {}

jobs:
  connectors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ody-refine test -- integration/
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```
