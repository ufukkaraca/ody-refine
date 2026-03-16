# Contributing to Ody Platform

Thanks for your interest in contributing. This guide covers everything you need to get started.

## Setup

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9
git clone https://github.com/rodyr/ody-platform.git
cd ody-platform
pnpm install
```

## Development workflow

```bash
pnpm build         # Build all packages
pnpm test          # Run all tests
pnpm typecheck     # TypeScript check
pnpm lint          # ESLint
pnpm verify        # All of the above
```

### Working on a specific package

```bash
# Run tests for just the detectors package
pnpm --filter @useody/detectors test

# Build just core
pnpm --filter @useody/platform-core build
```

## Code style

- **Max 250 lines** per `.ts` file. No exceptions.
- **Module system:** `"nodenext"` with explicit `.js` extensions on all imports.
- **No `any` type.** Use `unknown` and narrow.
- **Explicit return types** on all functions.
- **JSDoc comments** on all public exports.
- **File naming:** kebab-case for files, PascalCase for types/interfaces, camelCase for functions.
- **Tests:** vitest with `describe` + `it` blocks, in `__tests__/` adjacent to `src/`.
- **No `console.log`** in library code. Accept an optional logger callback.
- **No vendor SDK imports** in `packages/core` or `packages/detectors`. LLM calls go through the `LLMProvider` interface.

## Project structure

```
packages/
  core/         @useody/platform-core  — types, SQLite, vector search, providers
  detectors/    @useody/detectors      — 5 pure-function detectors
  export/       @useody/export         — HTML report, JSONL export
apps/
  refine/       ody-refine          — CLI application
```

## Writing a detector

Detectors are pure functions: `(nodes, edges, llm?) -> Detection[]`. They have no side effects and no I/O.

```typescript
import type { DetectorFn } from '@useody/platform-core';

const detectMyIssue: DetectorFn = async (nodes, edges, llm) => {
  const detections: Detection[] = [];
  // Your logic here
  return detections;
};

detectMyIssue.preFilter = {
  similarityThreshold: 0.6,  // minimum cosine similarity for candidate pairs
  topK: 10,                   // max candidates per node
};

export { detectMyIssue };
```

## Pull request process

1. Fork the repo and create a branch from `main`.
2. Make your changes. Keep commits focused.
3. Run `pnpm verify` and make sure everything passes.
4. Open a PR against `main` with a clear description of what and why.
5. One approval required to merge.

### PR checklist

- [ ] `pnpm verify` passes (lint + typecheck + test)
- [ ] No files exceed 250 lines
- [ ] New public APIs have JSDoc comments
- [ ] New features have tests

## Reporting issues

Open an issue on GitHub. Include:
- What you expected vs. what happened
- Steps to reproduce
- Your environment (OS, Node version, Ollama version if relevant)

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](./LICENSE).
