# API Reference

**Version:** 2.1
**Last updated:** 2024-06-15
**Maintained by:** Platform team

---

## Authentication

All API requests require a Bearer token in the `Authorization` header.

```http
Authorization: Bearer <your_token>
```

Tokens are issued via the `/auth/token` endpoint. **Tokens expire after 24 hours.**
Use the `/auth/refresh` endpoint to get a new token without re-authenticating.

> **Note:** We are planning to migrate to OAuth 2.0 device flow by **Q3 2025**.
> The current token endpoint will be deprecated at that point.

### API Keys (legacy)

API keys are still supported for backwards compatibility. They are valid indefinitely
until rotated. We strongly recommend switching to Bearer tokens before the Q3 2025
deprecation.

---

## Rate Limiting

To protect backend stability, all endpoints are rate limited to **1,000 requests per
minute** per API key. Requests exceeding this limit receive a `429 Too Many Requests`
response with a `Retry-After` header.

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1718467200
```

---

## Endpoints

### GET /users

Returns a paginated list of users in the organization.

**Parameters:**
- `page` (int, optional) — page number, default 1
- `limit` (int, optional) — results per page, max 100

### POST /users

Create a new user. Requires `admin` role.

### GET /vaults

Returns all vaults the authenticated user has access to.

### POST /vaults/{id}/documents

Upload a document to a vault. Accepted formats: PDF, Markdown, DOCX.

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400  | Bad request — check request body |
| 401  | Unauthorized — token missing or expired |
| 403  | Forbidden — insufficient permissions |
| 429  | Rate limit exceeded |
| 500  | Internal server error |

---

## SDK

Official SDKs available for TypeScript, Python, and Go.

```bash
npm install @acme/api-client
pip install acme-api
go get github.com/acme/api-go
```

See the GitHub repositories for usage examples and changelog.
