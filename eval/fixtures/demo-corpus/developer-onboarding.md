# Developer Onboarding — API Integration Guide

**Audience:** New developers integrating with the Acme Platform API
**Maintained by:** Developer Relations
**Last updated:** 2025-12-03

## Welcome

This guide walks you through everything you need to know to integrate with the Acme Platform API. By the end, you'll have a working integration that authenticates, makes API calls, and handles errors gracefully.

## Before You Start

Make sure you have:

- [ ] An Acme Corp developer account (sign up at developers.acme-corp.com)
- [ ] API credentials (client ID and secret from the Developer Console)
- [ ] One of our supported SDKs installed, or a tool like `curl` or Postman for testing

## Step 1: Get Your API Credentials

1. Log into the **Developer Console** at `https://console.acme-corp.com`
2. Navigate to **Settings → API Keys**
3. Click **Create New Key Pair**
4. Store your `client_id` and `client_secret` securely — the secret is only shown once

### Environment Setup

We recommend using environment variables for credentials:

```bash
export ACME_CLIENT_ID="your_client_id"
export ACME_CLIENT_SECRET="your_client_secret"
export ACME_API_BASE="https://api.acme-corp.com/v2"
```

## Step 2: Authenticate

Exchange your credentials for an access token:

```bash
curl -X POST https://api.acme-corp.com/v2/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "'$ACME_CLIENT_ID'",
    "client_secret": "'$ACME_CLIENT_SECRET'",
    "grant_type": "client_credentials"
  }'
```

You'll receive a response like:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 172800
}
```

The token is valid for **48 hours** from issuance. Store it securely and refresh it before it expires. We recommend setting up a cron job or background process that refreshes the token every 36 hours to maintain uninterrupted access.

### Token Management Tips

- Never hardcode tokens in your source code
- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault) in production
- Set up monitoring to alert if token refresh fails
- For server-to-server integrations, implement automatic refresh with a 10% buffer before expiry

## Step 3: Make Your First API Call

With your token in hand, try listing users:

```bash
curl https://api.acme-corp.com/v2/users \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

If everything is set up correctly, you'll see a JSON response with your organization's users.

## Step 4: Understand Rate Limits

The API enforces rate limits to protect platform stability. Your limit depends on your plan:

| Plan | Requests per Minute |
|------|-------------------|
| Free | 100 |
| Pro | **500** |
| Enterprise | Contact sales |

When you hit the rate limit, the API responds with HTTP 429. Check the `Retry-After` header and wait before retrying.

### Handling Rate Limits in Code

```python
import time
import requests

def make_api_call(url, headers):
    response = requests.get(url, headers=headers)

    if response.status_code == 429:
        retry_after = int(response.headers.get('Retry-After', 60))
        print(f"Rate limited. Waiting {retry_after} seconds...")
        time.sleep(retry_after)
        return make_api_call(url, headers)  # Retry

    return response
```

### Tips to Stay Within Limits

- Cache responses that don't change frequently (user profiles, organization settings)
- Use webhooks instead of polling for real-time event notifications
- Batch operations where possible (e.g., bulk user creation endpoint)
- Implement request queuing for high-throughput integrations

## Step 5: Set Up Webhooks

Instead of polling, register webhooks to receive real-time notifications:

```bash
curl -X POST https://api.acme-corp.com/v2/webhooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/acme-webhook",
    "events": ["user.created", "workflow.completed"]
  }'
```

### Webhook Security

Always verify webhook signatures before processing payloads:

```python
import hmac
import hashlib

def verify_signature(payload, signature, secret):
    expected = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
```

## Step 6: Error Handling

Build robust error handling into your integration from day one:

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 400 | Bad request | Check your request payload |
| 401 | Unauthorized | Refresh your token |
| 403 | Forbidden | Check permissions |
| 404 | Not found | Verify the resource ID |
| 429 | Rate limited | Wait and retry |
| 500 | Server error | Retry with backoff, then contact support |

## Common Integration Patterns

### Syncing Users

```python
def sync_users():
    page = 1
    while True:
        response = api.get(f"/users?page={page}&per_page=200")
        users = response["data"]

        for user in users:
            upsert_to_local_db(user)

        if page >= response["pagination"]["total_pages"]:
            break
        page += 1
```

### Triggering Workflows

```python
def deploy(version, environment):
    run = api.post(f"/workflows/{DEPLOY_WORKFLOW_ID}/trigger", {
        "inputs": {
            "version": version,
            "target": environment
        }
    })
    return run["run_id"]
```

## Debugging Tips

- Enable request logging in development to inspect full request/response cycles
- Use the API's `X-Request-Id` header to correlate requests with our support team
- Test in our sandbox environment first: `https://sandbox-api.acme-corp.com/v2`
- Check https://status.acme-corp.com for known outages before investigating local issues

## Getting Help

- **Developer docs**: https://docs.acme-corp.com
- **API changelog**: https://docs.acme-corp.com/changelog
- **Community forum**: https://community.acme-corp.com
- **Support tickets**: developer-support@acme-corp.com
- **Office hours**: Wednesdays at 2 PM UTC — sign up at developers.acme-corp.com/office-hours
