# Acme Platform API Reference

**Version:** v2.4
**Base URL:** `https://api.acme-corp.com/v2`
**Last updated:** 2025-09-20

## Overview

The Acme Platform API allows you to programmatically manage users, subscriptions, and workflows. All endpoints use REST conventions and return JSON responses.

## Authentication

All API requests must include a valid access token in the `Authorization` header:

```
Authorization: Bearer <your_access_token>
```

### Obtaining Tokens

Request an access token by POSTing your API credentials to the token endpoint:

```http
POST /auth/token
Content-Type: application/json

{
  "client_id": "your_client_id",
  "client_secret": "your_client_secret",
  "grant_type": "client_credentials"
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

Access tokens are valid for **24 hours** (86,400 seconds) from the time of issuance. After expiration, you must request a new token. We recommend refreshing tokens proactively when they are within 1 hour of expiry.

### Token Best Practices

- Store tokens securely — never expose them in client-side code or logs
- Rotate your API credentials every 90 days
- Use separate credentials for each environment (staging, production)
- Implement token refresh logic to avoid service disruptions

## Rate Limiting

To ensure fair usage and platform stability, the API enforces rate limits on all endpoints.

### Default Limits

| Tier | Rate Limit | Burst Limit |
|------|-----------|-------------|
| Free | 100 req/min | 20 req/sec |
| Pro | 500 req/min | 50 req/sec |
| Enterprise | **1,000 req/min** | 100 req/sec |

Rate limit information is included in every response via headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1695234060
```

When you exceed the rate limit, the API returns a `429 Too Many Requests` response with a `Retry-After` header indicating how many seconds to wait.

### Rate Limit Best Practices

- Implement exponential backoff for 429 responses
- Cache responses where possible to reduce unnecessary calls
- Use webhooks instead of polling for real-time updates
- Contact sales@acme-corp.com if you need higher limits

## Endpoints

### Users

#### List Users

```http
GET /users?page=1&per_page=50
```

Returns a paginated list of users in your organization. Default page size is 50, maximum is 200.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | integer | Page number (default: 1) |
| per_page | integer | Results per page (default: 50, max: 200) |
| status | string | Filter by status: `active`, `inactive`, `pending` |
| role | string | Filter by role: `admin`, `member`, `viewer` |

**Response:**

```json
{
  "data": [
    {
      "id": "usr_abc123",
      "email": "jane@example.com",
      "name": "Jane Smith",
      "role": "admin",
      "status": "active",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 142,
    "total_pages": 3
  }
}
```

#### Create User

```http
POST /users
Content-Type: application/json

{
  "email": "new.user@example.com",
  "name": "New User",
  "role": "member"
}
```

Returns the created user object with a `201 Created` status.

#### Get User

```http
GET /users/:id
```

Returns a single user by their ID.

#### Update User

```http
PATCH /users/:id
Content-Type: application/json

{
  "role": "admin"
}
```

#### Delete User

```http
DELETE /users/:id
```

Returns `204 No Content` on success. Deleted users are soft-deleted and can be restored within 30 days.

### Workflows

#### List Workflows

```http
GET /workflows
```

Returns all workflows in the organization.

#### Trigger Workflow

```http
POST /workflows/:id/trigger
Content-Type: application/json

{
  "inputs": {
    "target": "production",
    "version": "v1.2.3"
  }
}
```

Triggers an asynchronous workflow execution. Returns a `run_id` that can be used to poll status.

### Webhooks

#### Register Webhook

```http
POST /webhooks
Content-Type: application/json

{
  "url": "https://your-app.com/webhook",
  "events": ["user.created", "user.updated", "workflow.completed"],
  "secret": "your_webhook_secret"
}
```

Webhook payloads are signed with your secret using HMAC-SHA256. Verify the `X-Acme-Signature` header on incoming requests.

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "You have exceeded the rate limit. Please retry after 30 seconds.",
    "status": 429
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| UNAUTHORIZED | 401 | Invalid or expired token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource does not exist |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error — contact support |

## SDKs & Libraries

Official SDKs are available for:

- **JavaScript/TypeScript**: `npm install @acme-corp/sdk`
- **Python**: `pip install acme-sdk`
- **Go**: `go get github.com/acme-corp/sdk-go`

All SDKs handle authentication, retries, and rate limit backoff automatically.

## Support

- Documentation: https://docs.acme-corp.com
- Status page: https://status.acme-corp.com
- Support email: api-support@acme-corp.com
- Slack community: https://acme-community.slack.com
