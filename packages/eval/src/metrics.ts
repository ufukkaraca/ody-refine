/**
 * Pure scoring functions for evaluation.
 * @module eval/metrics
 */

/**
 * Cosine similarity between two vectors.
 * Returns 0 if either vector is zero-length or empty.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dot / denominator;
}

/**
 * Semantic similarity between two embedding vectors.
 * Wrapper around cosineSimilarity for API clarity.
 */
export function calculateSemanticSimilarity(
  a: number[],
  b: number[],
): number {
  return cosineSimilarity(a, b);
}

/**
 * Keyword overlap accuracy score between expected and actual text.
 * Returns fraction of expected keywords present in actual (0-1).
 */
export function calculateAccuracy(
  expected: string,
  actual: string,
): number {
  const normalize = (text: string): string[] => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
  };

  const expectedWords = normalize(expected);
  if (expectedWords.length === 0) return 1;

  const actualWords = new Set(normalize(actual));
  let matches = 0;

  for (const word of expectedWords) {
    if (actualWords.has(word)) {
      matches++;
    }
  }

  return matches / expectedWords.length;
}

const NEGATION_WORDS = new Set([
  'not', 'no', 'never', 'none', 'neither', 'nor',
  'nothing', 'nowhere', 'nobody', "don't", "doesn't",
  "didn't", "won't", "wouldn't", "shouldn't", "couldn't",
  "isn't", "aren't", "wasn't", "weren't", "cannot",
]);

/**
 * Heuristic contradiction detection.
 * Checks if actual text contains negation words applied to subjects
 * shared with expected text.
 */
export function detectContradiction(
  expected: string,
  actual: string,
): boolean {
  const extractWords = (text: string): string[] => {
    return text
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);
  };

  const expectedWords = extractWords(expected);
  const actualWords = extractWords(actual);

  const expectedSubjects = new Set(
    expectedWords.filter((w) => w.length > 3 && !NEGATION_WORDS.has(w)),
  );

  const hasSharedSubject = actualWords.some(
    (w) => expectedSubjects.has(w) && !NEGATION_WORDS.has(w),
  );
  const hasNegation = actualWords.some((w) => NEGATION_WORDS.has(w));

  return hasSharedSubject && hasNegation;
}

/**
 * N-gram overlap (ROUGE-L inspired) between expected and actual.
 * Uses longest common subsequence ratio for semantic accuracy.
 */
export function calculateNgramOverlap(
  expected: string,
  actual: string,
): number {
  const normalize = (t: string): string[] =>
    t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 0);

  const expTokens = normalize(expected);
  const actTokens = normalize(actual);
  if (expTokens.length === 0) return 1;
  if (actTokens.length === 0) return 0;

  const lcsLen = lcs(expTokens, actTokens);
  const precision = lcsLen / actTokens.length;
  const recall = lcsLen / expTokens.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/** Longest common subsequence length. */
function lcs(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = (prev[j - 1] ?? 0) + 1;
      } else {
        curr[j] = Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[n] ?? 0;
}

/**
 * Contradiction resolution rate: fraction of items where the model
 * chose the correct version over the incorrect one.
 * Measures whether model answer is closer to chosen than rejected.
 */
export function calculateResolutionRate(
  items: Array<{ modelAnswer: string; chosen: string; rejected: string }>,
): number {
  if (items.length === 0) return 0;
  let correct = 0;
  for (const item of items) {
    const chosenScore = calculateAccuracy(item.chosen, item.modelAnswer);
    const rejectedScore = calculateAccuracy(item.rejected, item.modelAnswer);
    if (chosenScore > rejectedScore) correct++;
  }
  return correct / items.length;
}
