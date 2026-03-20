# Real Documentation Test Fixtures

Test fixtures sourced from real public documentation to validate detectors
against non-synthetic data. See ODY-141.

## Doc Sets

### FastAPI (Python web framework)

Source: https://github.com/tiangolo/fastapi — `docs/en/docs/`

| File | Content | Expected detector signals |
|------|---------|--------------------------|
| `versions.md` | Versioning and pinning guidance | Staleness (version refs) |
| `first-steps.md` | Getting started tutorial | Duplicates (overlaps with docker.md on deployment) |
| `docker.md` | Docker deployment guide | Time bombs (deprecated image, Q4 2024 deadline), Staleness (Sept 2023 date) |
| `security-jwt.md` | JWT authentication tutorial | Contradictions (passlib vs pwdlib recommendation) |
| `settings.md` | Environment variables and config | Duplicates (overlaps with security on env vars) |

### Express.js (Node web framework)

Source: https://github.com/expressjs/expressjs.com — `en/guide/`

| File | Content | Expected detector signals |
|------|---------|--------------------------|
| `routing.md` | Route definitions and patterns | Contradictions (Express 4 vs 5 behavior) |
| `error-handling.md` | Error handling patterns | Duplicates (overlaps with middleware on error handling) |
| `using-middleware.md` | Middleware usage guide | Duplicates (overlaps with error-handling) |
| `migrating-5.md` | Express 4→5 migration guide | Time bombs (end of 2024 deadline), Contradictions (v4 vs v5 API changes) |
| `overriding-api.md` | API customization | Staleness (references Express 4.x patterns) |

## Validation Results (2026-03-18)

Run with `anthropic/claude-3-haiku` via OpenRouter.

### FastAPI (5 docs)

| Detector | Findings | Details |
|----------|----------|---------|
| Contradictions | 5 | Docker deprecated image vs new approach; Uvicorn vs Gunicorn workers |
| Duplicates | 0 | BoW embeddings below 0.75 threshold — needs real embeddings |
| Staleness | 1 | "Last updated: September 2023" in docker.md (31 months old) |
| Undocumented | 0 | Expected — no chat nodes in doc-only corpus |
| Time bombs | 1 | Q4 2024 migration deadline in docker.md |

### Express.js (5 docs)

| Detector | Findings | Details |
|----------|----------|---------|
| Contradictions | 3 | Error handling patterns across error-handling.md + middleware docs |
| Duplicates | 0 | Same BoW threshold limitation |
| Staleness | 0 | No explicit date references found |
| Undocumented | 0 | Expected — no chat nodes |
| Time bombs | 0 | "End of 2024" deadline not parsed (inside prose context) |

### Combined (10 docs)

Total: 10 findings. Cross-set contradictions found (FastAPI vs Express patterns).

## Running

```bash
# From packages/detectors:
cd packages/detectors
RUN_INTEGRATION=1 OPENROUTER_API_KEY=<key> npx vitest run __tests__/real-doc-validation

# macOS keychain shortcut:
RUN_INTEGRATION=1 OPENROUTER_API_KEY=$(security find-generic-password -s "ody-openrouter" -w) \
  npx vitest run __tests__/real-doc-validation
```

## Size budget

Total fixture size: ~22 KB (budget: 50 KB max).
