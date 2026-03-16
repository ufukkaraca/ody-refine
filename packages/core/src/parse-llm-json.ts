/**
 * Robust JSON parser for LLM responses.
 * Handles direct JSON, fenced code blocks, embedded objects, and truncated responses.
 * @module parse-llm-json
 */
import type { ParseLlmJsonResult } from './types.js';

/** Parse a JSON response from an LLM, handling common formatting issues. */
export function parseLlmJsonResponse<T>(response: string): ParseLlmJsonResult<T> {
  const trimmed = response.trim();
  if (!trimmed) {
    return { data: null, parseMode: null, error: 'LLM response was empty' };
  }

  const direct = tryParseJson<T>(trimmed);
  if (direct.data !== null) {
    return { data: direct.data, parseMode: 'direct' };
  }

  const repairedDirect = tryRepairAndParseJson<T>(trimmed);
  if (repairedDirect.data !== null) {
    return { data: repairedDirect.data, parseMode: 'repaired' };
  }

  const errors: string[] = [
    `direct parse failed: ${direct.error}`,
    `direct repair failed: ${repairedDirect.error}`,
  ];

  const fencedBlocks = extractFencedJsonBlocks(trimmed);
  for (const block of fencedBlocks) {
    const parsed = tryParseJson<T>(block);
    if (parsed.data !== null) {
      return { data: parsed.data, parseMode: 'fenced' };
    }
    errors.push(`fenced parse failed: ${parsed.error}`);

    const repaired = tryRepairAndParseJson<T>(block);
    if (repaired.data !== null) {
      return { data: repaired.data, parseMode: 'repaired' };
    }
    errors.push(`fenced repair failed: ${repaired.error}`);
  }
  if (fencedBlocks.length === 0) {
    errors.push('no fenced JSON block found');
  }

  const embedded = extractFirstJsonObject(trimmed);
  if (embedded) {
    const parsed = tryParseJson<T>(embedded);
    if (parsed.data !== null) {
      return { data: parsed.data, parseMode: 'embedded' };
    }
    errors.push(`embedded parse failed: ${parsed.error}`);

    const repaired = tryRepairAndParseJson<T>(embedded);
    if (repaired.data !== null) {
      return { data: repaired.data, parseMode: 'repaired' };
    }
    errors.push(`embedded repair failed: ${repaired.error}`);
  } else {
    errors.push('no embedded JSON object found');
  }

  return { data: null, parseMode: null, error: errors.join('; ') };
}

function tryParseJson<T>(value: string): { data: T | null; error?: string } {
  try {
    return { data: JSON.parse(value) as T };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { data: null, error: message };
  }
}

function extractFencedJsonBlocks(text: string): string[] {
  const blocks: string[] = [];
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;

  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    const candidate = match[1]?.trim();
    if (candidate) blocks.push(candidate);
  }

  return blocks;
}

function extractFirstJsonObject(text: string): string | null {
  let start = text.indexOf('{');

  while (start !== -1) {
    const candidate = readBalancedObject(text, start);
    if (candidate) return candidate;
    start = text.indexOf('{', start + 1);
  }

  return null;
}

function readBalancedObject(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return text.slice(startIndex).trim() || null;
}

function tryRepairAndParseJson<T>(
  value: string,
): { data: T | null; error?: string } {
  const repaired = repairTruncatedJson(value);
  if (!repaired) {
    return { data: null, error: 'repair did not produce a candidate' };
  }
  return tryParseJson<T>(repaired);
}

function repairTruncatedJson(text: string): string | null {
  const source = text.trim();
  if (!source) return null;

  const openBrace = source.indexOf('{');
  const openBracket = source.indexOf('[');
  const start = Math.min(
    openBrace === -1 ? Number.POSITIVE_INFINITY : openBrace,
    openBracket === -1 ? Number.POSITIVE_INFINITY : openBracket,
  );

  if (!Number.isFinite(start)) return null;

  const candidate = source.slice(start);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let repaired = '';

  for (const char of candidate) {
    if (inString) {
      if (escaped) {
        repaired += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        repaired += char;
        escaped = true;
        continue;
      }
      if (char === '\n') {
        repaired += '\\n';
        continue;
      }
      if (char === '\r') {
        continue;
      }
      repaired += char;
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      repaired += char;
      continue;
    }
    if (char === '{') {
      stack.push('}');
      repaired += char;
      continue;
    }
    if (char === '[') {
      stack.push(']');
      repaired += char;
      continue;
    }
    if (char === '}' || char === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === char) {
        stack.pop();
      }
      repaired += char;
      continue;
    }
    repaired += char;
  }

  if (escaped) {
    repaired = repaired.slice(0, -1);
  }
  if (inString) {
    repaired += '"';
  }
  while (stack.length > 0) {
    repaired = repaired.replace(/,\s*$/, '');
    repaired += stack.pop();
  }
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  return repaired;
}
