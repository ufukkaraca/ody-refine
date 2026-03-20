import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverFiles } from '../src/ingest/discover.js';

describe('discoverFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ody-refine-discover-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds .md files recursively', () => {
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');
    mkdirSync(join(tempDir, 'docs'));
    writeFileSync(join(tempDir, 'docs', 'guide.md'), '# Guide');

    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith('readme.md'))).toBe(true);
    expect(files.some((f) => f.endsWith('guide.md'))).toBe(true);
  });

  it('finds .pdf files', () => {
    writeFileSync(join(tempDir, 'doc.pdf'), 'fake pdf content');

    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]!.endsWith('doc.pdf')).toBe(true);
  });

  it('ignores .txt and other extensions', () => {
    writeFileSync(join(tempDir, 'notes.txt'), 'some notes');
    writeFileSync(join(tempDir, 'data.csv'), 'a,b,c');
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');

    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]!.endsWith('readme.md')).toBe(true);
  });

  it('returns absolute paths', () => {
    writeFileSync(join(tempDir, 'test.md'), '# Test');

    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]!.startsWith('/')).toBe(true);
  });

  it('returns sorted paths', () => {
    writeFileSync(join(tempDir, 'z.md'), 'z');
    writeFileSync(join(tempDir, 'a.md'), 'a');
    writeFileSync(join(tempDir, 'm.md'), 'm');

    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(3);

    const names = files.map((f) => f.split('/').pop());
    expect(names).toEqual(['a.md', 'm.md', 'z.md']);
  });

  it('returns empty array for empty directory', () => {
    const files = discoverFiles(tempDir);
    expect(files).toEqual([]);
  });

  it('ignores node_modules', () => {
    mkdirSync(join(tempDir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(tempDir, 'node_modules', 'pkg', 'readme.md'), '# Pkg');
    writeFileSync(join(tempDir, 'real.md'), '# Real');

    const files = discoverFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]!.endsWith('real.md')).toBe(true);
  });
});
