/**
 * Tests that CLI help text is present and correct for all commands.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(import.meta.dirname ?? '.', '..', 'dist', 'cli.js');

function runHelp(args: string[]): string {
  const proc = spawnSync('node', [CLI, ...args, '--help'], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return (proc.stdout ?? '') + (proc.stderr ?? '');
}

describe('CLI help', () => {
  it('shows main help with all commands', () => {
    const output = runHelp([]);
    expect(output).toContain('ody-refine');
    expect(output).toContain('ingest');
    expect(output).toContain('detect');
    expect(output).toContain('resolve');
    expect(output).toContain('export');
    expect(output).toContain('report');
    expect(output).toContain('ci');
    expect(output).toContain('scan');
    expect(output).toContain('diff');
    expect(output).toContain('badge');
    expect(output).toContain('status');
    expect(output).toContain('config');
  });

  it('shows version', () => {
    const proc = spawnSync('node', [CLI, '--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(proc.stdout?.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('ingest help shows examples', () => {
    const output = runHelp(['ingest']);
    expect(output).toContain('--notion-export');
    expect(output).toContain('--confluence-export');
  });

  it('ci help shows threshold options', () => {
    const output = runHelp(['ci']);
    expect(output).toContain('--min-health');
    expect(output).toContain('--fail-on-regression');
  });

  it('scan help shows URL argument', () => {
    const output = runHelp(['scan']);
    expect(output).toContain('<url>');
    expect(output).toContain('--max-pages');
  });

  it('badge help shows SVG option', () => {
    const output = runHelp(['badge']);
    expect(output).toContain('--svg');
    expect(output).toContain('README');
  });

  it('diff help shows since option', () => {
    const output = runHelp(['diff']);
    expect(output).toContain('--since');
  });

  it('resolve help shows auto option', () => {
    const output = runHelp(['resolve']);
    expect(output).toContain('--auto');
  });
});
