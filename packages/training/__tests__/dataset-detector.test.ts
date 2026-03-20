import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import { detectDatasetType, analyzeRefineExport } from '../src/dataset-detector.js';

function tmpFile(content: string): string {
  const dir = join(tmpdir(), `ody-dataset-test-${crypto.randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'export.jsonl');
  writeFileSync(file, content);
  return file;
}

describe('detectDatasetType', () => {
  it('returns dpo when all lines are preference pairs', () => {
    const lines = [
      JSON.stringify({ prompt: 'Q1', chosen: 'A', rejected: 'B' }),
      JSON.stringify({ prompt: 'Q2', chosen: 'C', rejected: 'D' }),
    ];
    expect(detectDatasetType(lines)).toBe('dpo');
  });

  it('returns sft when all lines are knowledge nodes', () => {
    const lines = [
      JSON.stringify({ id: '1', title: 'T', content: 'C', confidence: 0.9 }),
      JSON.stringify({ id: '2', title: 'T2', content: 'C2', confidence: 0.8 }),
    ];
    expect(detectDatasetType(lines)).toBe('sft');
  });

  it('returns mixed when both types are present', () => {
    const lines = [
      JSON.stringify({ prompt: 'Q', chosen: 'A', rejected: 'B' }),
      JSON.stringify({ id: '1', title: 'T', content: 'C', confidence: 0.9 }),
    ];
    expect(detectDatasetType(lines)).toBe('mixed');
  });

  it('returns sft for empty lines array', () => {
    expect(detectDatasetType([])).toBe('sft');
  });

  it('skips blank lines', () => {
    const lines = [
      '',
      '   ',
      JSON.stringify({ prompt: 'Q', chosen: 'A', rejected: 'B' }),
    ];
    expect(detectDatasetType(lines)).toBe('dpo');
  });

  it('skips invalid JSON lines', () => {
    const lines = [
      'not json at all',
      JSON.stringify({ prompt: 'Q', chosen: 'A', rejected: 'B' }),
    ];
    expect(detectDatasetType(lines)).toBe('dpo');
  });

  it('returns sft when lines have unrecognized fields', () => {
    const lines = [
      JSON.stringify({ foo: 'bar', baz: 123 }),
    ];
    expect(detectDatasetType(lines)).toBe('sft');
  });

  it('detects mixed early and short-circuits', () => {
    const lines = [
      JSON.stringify({ prompt: 'Q', chosen: 'A', rejected: 'B' }),
      JSON.stringify({ id: '1', title: 'T', content: 'C', confidence: 0.9 }),
      // Would not need to read further
      JSON.stringify({ prompt: 'Q2', chosen: 'A2', rejected: 'B2' }),
    ];
    expect(detectDatasetType(lines)).toBe('mixed');
  });
});

describe('analyzeRefineExport', () => {
  it('counts preference pairs and nodes correctly', async () => {
    const content = [
      JSON.stringify({ prompt: 'Q1', chosen: 'A', rejected: 'B' }),
      JSON.stringify({ prompt: 'Q2', chosen: 'C', rejected: 'D' }),
      JSON.stringify({ id: '1', title: 'T', content: 'C', confidence: 0.9 }),
    ].join('\n');
    const file = tmpFile(content);

    try {
      const result = await analyzeRefineExport(file);
      expect(result.type).toBe('mixed');
      expect(result.preferencePairCount).toBe(2);
      expect(result.nodeCount).toBe(1);
      expect(result.totalEntries).toBe(3);
      expect(result.invalidLines).toBe(0);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('counts invalid lines and provides details', async () => {
    const content = [
      'not json',
      JSON.stringify({ prompt: 'Q', chosen: 'A', rejected: 'B' }),
      JSON.stringify({ random: 'fields' }),
    ].join('\n');
    const file = tmpFile(content);

    try {
      const result = await analyzeRefineExport(file);
      expect(result.preferencePairCount).toBe(1);
      expect(result.invalidLines).toBe(2);
      expect(result.invalidLineDetails).toHaveLength(2);
      expect(result.invalidLineDetails[0]!.lineNumber).toBe(1);
      expect(result.invalidLineDetails[0]!.reason).toMatch(/JSON/i);
      expect(result.invalidLineDetails[1]!.lineNumber).toBe(3);
      expect(result.invalidLineDetails[1]!.reason).toMatch(/unrecognized fields/);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('throws on file not found', async () => {
    await expect(analyzeRefineExport('/nonexistent/path.jsonl')).rejects.toThrow(
      /File not found/,
    );
  });

  it('throws on empty file', async () => {
    const file = tmpFile('');

    try {
      await expect(analyzeRefineExport(file)).rejects.toThrow('empty');
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('throws on file with only blank lines', async () => {
    const file = tmpFile('\n\n  \n');

    try {
      await expect(analyzeRefineExport(file)).rejects.toThrow('empty');
    } finally {
      rmSync(file, { force: true });
    }
  });
});
