# Contributing to Ody Platform

Thanks for your interest in contributing. This guide covers everything you need.

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- [pnpm 9+](https://pnpm.io)

## Setup

```bash
git clone https://github.com/ufukkaraca/ody-platform.git
cd ody-platform
pnpm install
pnpm verify    # lint + typecheck + test — should all pass
```

## Development

```bash
pnpm build         # Build all packages
pnpm test          # Run all tests
pnpm typecheck     # TypeScript check
pnpm lint          # ESLint
pnpm verify        # All of the above
```

### Working on a specific package

```bash
pnpm --filter @useody/detectors test       # Test detectors only
pnpm --filter @useody/platform-core build  # Build core only
pnpm --filter ody-refine build             # Build the CLI
```

## Code style

- **Max 250 lines** per `.ts` file. No exceptions.
- **Module system:** `"nodenext"` with explicit `.js` extensions on all imports.
- **No `any` type.** Use `unknown` and narrow.
- **Explicit return types** on all functions.
- **JSDoc comments** on all public exports.
- **File naming:** kebab-case for files, PascalCase for types, camelCase for functions.
- **Tests:** vitest with `describe` + `it`, in `__tests__/` adjacent to `src/`.
- **No `console.log`** in library code. Accept an optional logger callback.
- **No vendor SDK imports** in `packages/core` or `packages/detectors`.

## Project structure

```
packages/
  core/         @useody/platform-core  — types, SQLite, vector search, providers
  detectors/    @useody/detectors      — 5 pure-function detectors
  export/       @useody/export         — HTML report, JSONL export
apps/
  refine/       ody-refine             — CLI application
```

## Writing a detector

Detectors are pure functions: `(nodes, edges, llm?) -> Detection[]`. No side effects, no I/O.

```typescript
import type { DetectorFn, Detection } from '@useody/platform-core';

const detectMyIssue: DetectorFn = async (nodes, edges, llm) => {
  const detections: Detection[] = [];
  // Your logic here
  return detections;
};

detectMyIssue.preFilter = {
  similarityThreshold: 0.6,
  topK: 10,
};

export { detectMyIssue };
```

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make your changes. Keep commits focused.
3. Run `pnpm verify` — everything must pass.
4. Open a PR with a clear description.

### PR checklist

- [ ] `pnpm verify` passes
- [ ] No files exceed 250 lines
- [ ] New public APIs have JSDoc
- [ ] New features have tests

## Issues

Open a [GitHub issue](https://github.com/ufukkaraca/ody-platform/issues). Include:
- What you expected vs. what happened
- Steps to reproduce
- Environment (OS, Node version, ody-refine version)

## License

By contributing, you agree that your contributions will be licensed under [Apache 2.0](./LICENSE).
