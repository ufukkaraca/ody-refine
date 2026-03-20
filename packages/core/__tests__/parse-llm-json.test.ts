import { describe, it, expect } from 'vitest';
import { parseLlmJsonResponse } from '../src/parse-llm-json.js';

describe('parseLlmJsonResponse', () => {
  it('parses direct JSON', () => {
    const result = parseLlmJsonResponse<{ a: number }>('{"a": 1}');
    expect(result.data).toEqual({ a: 1 });
    expect(result.parseMode).toBe('direct');
  });

  it('parses fenced JSON', () => {
    const input = 'Here is the result:\n```json\n{"b": 2}\n```\nDone.';
    const result = parseLlmJsonResponse<{ b: number }>(input);
    expect(result.data).toEqual({ b: 2 });
    expect(result.parseMode).toBe('fenced');
  });

  it('parses embedded JSON object', () => {
    const input = 'The analysis shows: {"key": "value"} as expected.';
    const result = parseLlmJsonResponse<{ key: string }>(input);
    expect(result.data).toEqual({ key: 'value' });
    expect(result.parseMode).toBe('embedded');
  });

  it('repairs truncated JSON', () => {
    const input = '{"items": ["a", "b"';
    const result = parseLlmJsonResponse<{ items: string[] }>(input);
    expect(result.data).toEqual({ items: ['a', 'b'] });
    expect(result.parseMode).toBe('repaired');
  });

  it('returns null for non-JSON input', () => {
    const result = parseLlmJsonResponse('Just some plain text.');
    expect(result.data).toBeNull();
    expect(result.parseMode).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('returns null for empty input', () => {
    const result = parseLlmJsonResponse('');
    expect(result.data).toBeNull();
    expect(result.parseMode).toBeNull();
    expect(result.error).toBe('LLM response was empty');
  });

  it('handles whitespace-only input', () => {
    const result = parseLlmJsonResponse('   \n\t  ');
    expect(result.data).toBeNull();
    expect(result.error).toBe('LLM response was empty');
  });

  it('parses JSON arrays', () => {
    const result = parseLlmJsonResponse<number[]>('[1, 2, 3]');
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.parseMode).toBe('direct');
  });

  it('handles nested objects', () => {
    const input = '{"outer": {"inner": true}}';
    const result = parseLlmJsonResponse<{ outer: { inner: boolean } }>(input);
    expect(result.data).toEqual({ outer: { inner: true } });
  });
});
