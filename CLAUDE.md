# Ody Platform — Agent Guide

Public repo (Apache 2.0). Contains: core libs, detectors, eval, export, Refine CLI, Forge CLI, feedback, training.

## Coding conventions

```
1. Max 250 lines per .ts file. No exceptions.
2. Use module: "nodenext" and explicit .js extensions on all imports.
3. Zero vendor SDK imports in packages/core and packages/detectors.
   LLM calls go through LLMProvider interface only.
4. All functions must have explicit return types.
5. All public exports must have JSDoc comments.
6. Use crypto.randomUUID() for ID generation (Node 20+).
7. Use vitest for all tests. describe + it blocks.
8. No `any` type. Use `unknown` and narrow.
9. Errors: throw typed errors, never swallow silently.
10. No console.log in library code. Accept optional logger callback.
11. File naming: kebab-case for files, PascalCase for types/interfaces,
    camelCase for functions/variables.
12. Every test file in __tests__/ directory adjacent to src/.
13. Run pnpm typecheck and pnpm test before considering done.
14. pnpm as package manager. turbo for task running.
```

## File Size Limit

- **Max 250 lines** per `.ts`/`.tsx` file
- Up to 400 lines for: SQLite DDL, generated code, test fixtures
- If exceeding, first line must be: `// EXCEEDS_LIMIT: <reason>`

## Commands

```bash
pnpm install       # Install deps
pnpm build         # Build all packages
pnpm test          # Run all tests
pnpm typecheck     # TypeScript check
pnpm lint          # ESLint
pnpm verify        # lint + typecheck + test
```
