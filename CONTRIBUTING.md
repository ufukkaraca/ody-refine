# Contributing to Ody Platform

Thanks for wanting to help. Ody is small, early-stage, and moves fast -- your contribution matters.

## Setup

You need **Node 20+**, **pnpm 9+**, and optionally **Ollama** (for LLM-powered detectors).

```bash
git clone https://github.com/ufukkaraca/ody-platform.git
cd ody-platform
pnpm install
pnpm build
```

For better detection results, install Ollama and pull the default models:

```bash
ollama pull nomic-embed-text
ollama pull qwen2.5:7b
```

## Verify everything works

```bash
pnpm verify   # runs lint + typecheck + test in one shot
```

You can also run them individually:

```bash
pnpm lint       # ESLint
pnpm typecheck  # TypeScript
pnpm test       # Vitest
```

**Run `pnpm verify` before every PR.** CI runs the same thing.

## Code style

These are not suggestions. They're enforced.

1. **Max 250 lines** per `.ts` file. If you absolutely need more (DDL, test fixtures), add `// EXCEEDS_LIMIT: <reason>` as the first line.
2. **`module: "nodenext"`** -- use explicit `.js` extensions on all imports.
3. **Explicit return types** on every function.
4. **No `any`** -- use `unknown` and narrow.
5. **No `console.log`** in library code. Accept an optional logger callback instead.
6. **Vitest** for all tests. `describe` + `it` blocks. Test files go in `__tests__/` adjacent to `src/`.
7. **JSDoc** on all public exports.
8. **kebab-case** files, **PascalCase** types, **camelCase** functions/variables.

## Adding a new detector

Detectors are pure functions: `(nodes, edges, llm?) -> Detection[]`. Look at `packages/detectors/src/staleness.ts` for a clean example.

1. Create `packages/detectors/src/your-detector.ts`.
2. Import types from `@useody/platform-core`:
   ```ts
   import type { KnowledgeNode, KnowledgeEdge, Detection, DetectorFn, LLMProvider } from '@useody/platform-core';
   ```
3. Export a function matching the `DetectorFn` signature.
4. Register it in `packages/detectors/src/index.ts`.
5. Add tests in `packages/detectors/__tests__/`.
6. Keep it pure -- no side effects, no network calls outside the optional `LLMProvider`.

## Adding a new provider

Providers implement the `LLMProvider` or `EmbeddingProvider` interface. Check `packages/core/src/providers/` for the pattern.

1. Create `packages/core/src/providers/your-provider.ts`.
2. Implement the interface from `packages/core/src/interfaces/llm.ts`.
3. Export it from `packages/core/src/providers/index.ts`.
4. Zero vendor SDK imports in `packages/core` -- use `fetch` or lightweight HTTP.
5. Add tests.

## Git hooks

Hooks are managed by [husky](https://typicode.github.io/husky/) and run automatically after `pnpm install`.

### Pre-commit (runs on every commit)

1. **Secret scanning** — blocks commits containing API keys (`sk-or-v1`, `sk-ant-`, `sk-proj-`, `xoxb-`, `xoxp-`, `secret_`), `.env` files, or local machine paths (`/Users/`).
2. **Lint staged files** — runs ESLint on staged `.ts`/`.tsx` files via `lint-staged`.
3. **Typecheck** — runs `pnpm typecheck` to catch type errors before they land.

### Pre-push (runs on every push)

1. **Full test suite** — runs `pnpm test`. Push is blocked if any test fails.

### Bypassing hooks

If you need to skip hooks (e.g., WIP commit), use `--no-verify`:

```bash
git commit --no-verify -m "WIP: in progress"
```

Do not bypass hooks for code going into a PR.

## PR process

1. Fork the repo and create a branch from `main`.
2. Make your changes. Keep commits focused.
3. Run `pnpm verify`. If it fails, fix it before pushing.
4. Open a PR against `main`. Describe what you changed and why.
5. CI will run the same `verify` pipeline. Green builds only.

Small PRs get reviewed faster. If your change is big, open an issue first so we can discuss the approach.

## Filing issues

### Bug reports

Include: what you ran, what happened, what you expected. Paste the full command and output. Node version and OS help too.

### Feature requests

Describe the problem you're solving, not just the feature you want. "Detect circular references in docs" is better than "add graph analysis."

## Code of conduct

Be kind. Be helpful. Assume good intent. We're building something useful together -- let's keep it that way.

If someone's being a jerk, email ufuk@useody.com.

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](./LICENSE).
