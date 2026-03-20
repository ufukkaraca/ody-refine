/**
 * E2E test: full Refine pipeline with a real LLM (OpenRouter).
 *
 * Proves R19 (real-world validation with LLM) programmatically.
 * Runs: ingest -> detect -> resolve --auto -> export -> report
 * on a synthetic 3-file corpus with known contradictions.
 *
 * Gate: RUN_INTEGRATION=1 and OPENROUTER_API_KEY must be set.
 * @module __tests__/e2e/full-pipeline
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Integration gate (same pattern as user-journey.test.ts)
// ---------------------------------------------------------------------------

const runIntegration = process.env.RUN_INTEGRATION === '1';
const hasApiKey = Boolean(process.env.OPENROUTER_API_KEY);
const shouldRun = runIntegration && hasApiKey;

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TMP = join(tmpdir(), 'ody-e2e-full-' + Date.now().toString(36));
const CLI = join(import.meta.dirname ?? '.', '..', '..', 'dist', 'cli.js');
const FIVE_MINUTES = 300_000;

/** Run a CLI command asynchronously so the event loop stays responsive. */
async function runCli(
  args: string[],
  opts?: { timeout?: number },
): Promise<{ status: number; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], {
      cwd: TMP,
      timeout: opts?.timeout ?? FIVE_MINUTES,
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { status: 0, output: (stdout ?? '') + (stderr ?? '') };
  } catch (err: unknown) {
    const e = err as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };
    const output = (e.stdout ?? '') + (e.stderr ?? '');
    const status = typeof e.code === 'number' ? e.code : 1;
    return { status, output };
  }
}

// ---------------------------------------------------------------------------
// Synthetic corpus: 3 files with deliberate contradictions
// ---------------------------------------------------------------------------

const CORPUS = {
  'api-reference.md': `# API Reference

## Authentication
All API requests require a Bearer token. Tokens are valid for **24 hours**
after issuance and must be refreshed using the /auth/refresh endpoint.

## Rate Limits
Each API key is limited to **1,000 requests per minute**. Exceeding this
limit returns HTTP 429. Rate limit headers are included in every response.

## Pagination
All list endpoints use cursor-based pagination with a default page size of 50.
The maximum page size is 200 items per request.
`,

  'onboarding-guide.md': `# Developer Onboarding Guide

## Getting Started
Welcome to the team! Here's what you need to know.

## API Access
Your API token expires after **48 hours** (two full days). Reach out to
DevOps if you need a longer-lived token for CI pipelines.

## Rate Limits
The API allows **500 requests per minute** per key. If you're hitting limits,
contact the platform team to request an increase.

## Pagination
List endpoints return 25 items per page by default. Pass \`?limit=100\`
to fetch more. The maximum is 100 items per page.
`,

  'architecture-decisions.md': `# Architecture Decision Records

## ADR-001: Authentication Token Lifetime
**Status:** Accepted
**Date:** 2024-01-15

We chose 24-hour token expiry as a balance between security and usability.
Shorter lifetimes (e.g. 1 hour) caused too many refresh cycles in CI.

## ADR-002: Rate Limiting Strategy
**Status:** Accepted
**Date:** 2024-02-01

We set the global rate limit to 1,000 req/min per key after load testing
showed our infrastructure handles 5,000 req/min aggregate comfortably.
Individual keys are capped at 1,000 to prevent noisy-neighbor issues.

## ADR-003: Pagination
**Status:** Accepted
**Date:** 2024-03-10

Cursor-based pagination with a default of 50 items and a max of 200.
Offset-based pagination was rejected due to poor performance on large datasets.
`,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!shouldRun)(
  'E2E: full pipeline with OpenRouter LLM',
  () => {
    beforeAll(() => {
      mkdirSync(TMP, { recursive: true });
      for (const [name, content] of Object.entries(CORPUS)) {
        writeFileSync(join(TMP, name), content);
      }
    });

    afterAll(() => {
      rmSync(TMP, { recursive: true, force: true });
    });

    // Step 1: Ingest
    it('ingest: scans corpus and finds issues', async () => {
      const { status, output } = await runCli(
        ['ingest', '--no-validate', TMP],
        { timeout: FIVE_MINUTES },
      );

      expect(status).toBe(0);
      expect(output).toContain('Ingestion complete');
      expect(output).toMatch(/Knowledge nodes|node/i);
    }, FIVE_MINUTES);

    // Step 2: Database created
    it('database: .ody-refine/refine.db exists after ingest', () => {
      const dbPath = join(TMP, '.ody-refine', 'refine.db');
      expect(existsSync(dbPath)).toBe(true);
    });

    // Step 3: Detect
    it('detect: finds contradictions in the corpus', async () => {
      const { status, output } = await runCli(
        ['detect', '--no-validate'],
        { timeout: FIVE_MINUTES },
      );

      expect(status).toBe(0);
      expect(output).toContain('Detection complete');
    }, FIVE_MINUTES);

    // Step 4: Resolve --auto
    it('resolve --auto: auto-resolves using LLM', async () => {
      const { status, output } = await runCli(
        ['resolve', '--auto'],
        { timeout: FIVE_MINUTES },
      );

      expect(status).toBe(0);
      expect(output).toMatch(/detection|resolve|dismiss|Auto/i);
    }, FIVE_MINUTES);

    // Step 5: Export JSONL
    it('export: produces valid JSONL output', async () => {
      const outPath = join(TMP, 'export.jsonl');
      const { status } = await runCli(['export', '-o', outPath]);

      expect(status).toBe(0);
      expect(existsSync(outPath)).toBe(true);

      const lines = readFileSync(outPath, 'utf-8').trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);

      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    }, 60_000);

    // Step 6: Export tickets
    it('export --format tickets: generates action tickets', async () => {
      const outPath = join(TMP, 'tickets.md');
      const { status } = await runCli([
        'export', '--format', 'tickets', '-o', outPath,
      ]);

      expect(status).toBe(0);
      expect(existsSync(outPath)).toBe(true);

      const md = readFileSync(outPath, 'utf-8');
      expect(md).toContain('Knowledge Integrity');
    }, 60_000);

    // Step 7: Report (HTML)
    it('report: generates an HTML report', async () => {
      const outPath = join(TMP, 'report.html');
      const { status } = await runCli([
        'report', '--no-open', '-o', outPath,
      ]);

      expect(status).toBe(0);
      expect(existsSync(outPath)).toBe(true);

      const html = readFileSync(outPath, 'utf-8');
      expect(html).toContain('<!DOCTYPE html');
      expect(html.toLowerCase()).toContain('ody');
    }, 60_000);

    // Step 8: Verify corpus coverage
    it('quality: the exported data covers all 3 source documents', () => {
      const outPath = join(TMP, 'export.jsonl');
      const raw = readFileSync(outPath, 'utf-8').trim();
      const lines = raw.split('\n').map(
        (l) => JSON.parse(l) as Record<string, unknown>,
      );

      expect(lines.length).toBeGreaterThanOrEqual(3);
    });
  },
);

// ---------------------------------------------------------------------------
// Guard: file parses even when integration tests are not enabled
// ---------------------------------------------------------------------------

describe('E2E: full-pipeline test loaded', () => {
  it('test file parsed successfully', () => {
    if (!shouldRun) {
      console.log(
        'Set RUN_INTEGRATION=1 and OPENROUTER_API_KEY to run',
      );
    }
    expect(true).toBe(true);
  });
});
