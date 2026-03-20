/**
 * Text utility functions for lexical matching in detectors.
 * Extracted from the undocumented detector.
 * @module helpers/text-utils
 */

/** Stop words filtered out during tokenization. */
export const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'discussion',
  'update',
  'changes',
  'change',
  'proposal',
  'announcement',
  'rollout',
  'thread',
  'notes',
  'week',
  'month',
  'new',
]);

/** Lowercase, remove punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize, split, and filter stopwords + short tokens (len < 2). */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

/** Return the intersection of two string arrays. */
export function sharedTokens(a: string[], b: string[]): string[] {
  const bSet = new Set(b);
  return [...new Set(a)].filter((token) => bSet.has(token));
}

/** Jaccard similarity: intersection / union. Returns 0 for empty inputs. */
export function lexicalScore(a: string[], b: string[]): number {
  const aSet = new Set(a);
  const bSet = new Set(b);
  const union = new Set([...aSet, ...bSet]);
  if (union.size === 0) return 0;
  return [...aSet].filter((token) => bSet.has(token)).length / union.size;
}

/** Build a signal from a title and facts for lexical matching. */
export function buildSignal(
  title: string,
  facts: string[],
): { titleTokens: string[]; tokens: string[] } {
  return {
    titleTokens: tokenize(title),
    tokens: tokenize(`${title} ${facts.slice(0, 5).join(' ')}`),
  };
}
