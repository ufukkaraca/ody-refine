/**
 * Tests for the audit command — verifies subcommand registration,
 * help text, and flag validation. Uses the built CLI binary.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(import.meta.dirname ?? '.', '..', 'dist', 'cli.js');

function runCli(args: string[]): { stdout: string; stderr: string; output: string } {
  const proc = spawnSync('node', [CLI, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  const stdout = proc.stdout ?? '';
  const stderr = proc.stderr ?? '';
  return { stdout, stderr, output: stdout + stderr };
}

describe('audit command', () => {
  it('audit is registered as a subcommand in the main CLI', () => {
    const { output } = runCli(['--help']);
    expect(output).toContain('audit');
  });

  it('audit --help shows description and options', () => {
    const { output } = runCli(['audit', '--help']);
    expect(output).toContain('Deep audit');
    expect(output).toContain('--deep');
    expect(output).toContain('--dir');
    expect(output).toContain('--notion');
    expect(output).toContain('--slack');
    expect(output).toContain('--notion-token');
    expect(output).toContain('--slack-token');
  });

  it('audit --help shows examples', () => {
    const { output } = runCli(['audit', '--help']);
    expect(output).toContain('ody-refine audit --dir');
    expect(output).toContain('--notion --slack');
  });

  it('audit without any source shows error', () => {
    const { output } = runCli(['audit']);
    expect(output).toContain('At least one source is required');
  });

  it('audit --deep without any source shows error (backward compat)', () => {
    const { output } = runCli(['audit', '--deep']);
    expect(output).toContain('At least one source is required');
  });

  it('audit --help shows provider and model options', () => {
    const { output } = runCli(['audit', '--help']);
    expect(output).toContain('--provider');
    expect(output).toContain('--model');
  });
});
