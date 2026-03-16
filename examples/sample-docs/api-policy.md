# API Governance Policy

**Version:** 1.4
**Last updated:** 2025-01-20
**Owner:** Engineering — Platform

---

## Purpose

This policy defines the rules for consuming and publishing APIs at Acme. All
engineering teams must comply before shipping a new integration.

---

## Rate Limits

Our API enforces rate limits of **500 requests per minute** to protect backend
services from abuse. These limits apply per API key across all environments.

Teams requiring higher throughput should contact the platform team to discuss
dedicated capacity or batch job scheduling.

> Reminder: API keys expire every **90 days** and must be rotated via the
> Developer Portal. Automated key rotation is available — see the runbooks repo.

---

## Authentication Requirements

- All new integrations must use Bearer tokens (JWT).
- API tokens are valid for **48 hours** after issuance.
- Refresh tokens are valid for 30 days.
- Legacy API keys are **not permitted** in new integrations as of 2025-01-01.

---

## Versioning

APIs must follow semantic versioning. Breaking changes require:
1. A deprecation notice period of at least 60 days
2. An entry in the API changelog
3. An ADR (Architecture Decision Record) filed in the `/docs/adrs/` directory

The last approved breaking change migration was completed in **2024-09**. All
consumers were notified and migrated within the window.

---

## Security

- TLS 1.2 minimum; TLS 1.3 preferred
- API responses must never include PII in error messages
- All endpoints must validate inputs and return structured errors (RFC 7807)

---

## Review Schedule

This policy is reviewed quarterly. Next scheduled review: **Q1 2026**.
