/**
 * End-to-end user journey test.
 * Simulates: ingest → detect → export → report
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const TMP = join(tmpdir(), 'ody-journey-' + Date.now().toString(36));
const CLI = join(import.meta.dirname ?? '.', '..', 'dist', 'cli.js');

// This is an integration test that requires a real LLM and takes 30-60s.
// Only runs when explicitly opted in via RUN_INTEGRATION=1.
const runIntegration = process.env.RUN_INTEGRATION === '1';

describe.skipIf(!runIntegration)('user journey', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });

    // Create two docs with a known contradiction
    writeFileSync(join(TMP, 'api-docs.md'), `# API Documentation

## Rate Limits
All API endpoints are rate limited to **1,000 requests per minute** per API key.
Authentication uses Bearer tokens that expire after 24 hours.
`);

    writeFileSync(join(TMP, 'developer-handbook.md'), `# Developer Handbook

## API Usage
Our API supports **500 requests per minute** per key. See the API docs for details.
Authentication tokens expire after 48 hours and must be refreshed manually.
`);
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('ingests docs and finds contradictions', () => {
    const proc = spawnSync(
      'node', [CLI, 'ingest', '--no-validate', TMP],
      { encoding: 'utf-8', cwd: TMP, timeout: 60000, env: { ...process.env } },
    );

    const combined = (proc.stdout ?? '') + (proc.stderr ?? '');
    expect(proc.status).toBe(0);
    expect(combined).toContain('Ingestion complete');
    expect(combined).toContain('Knowledge nodes');
    expect(combined).toMatch(/Found \d+ issue/);
  });

  it('creates a database after ingest', () => {
    expect(existsSync(join(TMP, '.ody-refine', 'refine.db'))).toBe(true);
  });

  it('exports nodes to JSONL', () => {
    const outPath = join(TMP, 'export.jsonl');
    const proc = spawnSync(
      'node', [CLI, 'export', '-o', outPath],
      { encoding: 'utf-8', cwd: TMP, timeout: 10000 },
    );

    expect(proc.status).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    const lines = readFileSync(outPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);

    // Each line should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('generates an HTML report', () => {
    const outPath = join(TMP, 'report.html');
    const proc = spawnSync(
      'node', [CLI, 'report', '--no-open', '-o', outPath],
      { encoding: 'utf-8', cwd: TMP, timeout: 10000 },
    );

    expect(proc.status).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    const html = readFileSync(outPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Ody Refine');
  });

  it('generates action tickets', () => {
    const outPath = join(TMP, 'tickets.md');
    const proc = spawnSync(
      'node', [CLI, 'export', '--format', 'tickets', '-o', outPath],
      { encoding: 'utf-8', cwd: TMP, timeout: 10000 },
    );

    expect(proc.status).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    const md = readFileSync(outPath, 'utf-8');
    expect(md).toContain('Knowledge Integrity');
  });
});
