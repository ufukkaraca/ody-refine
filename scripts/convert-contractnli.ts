/**
 * Convert ContractNLI (EMNLP 2021) to Ody corpus format.
 * Usage: npx tsx scripts/convert-contractnli.ts [--count=60]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const HF_API = 'https://datasets-server.huggingface.co/rows';
const DATASET = 'kiddothe2b/contract-nli';
const CONFIG = 'contractnli_a';
const SPLIT = 'test';
const BATCH_SIZE = 100;
const SEED = 42;

/** Label mapping from ClassLabel index. */
const LABEL_CONTRADICTION = 0;
const LABEL_ENTAILMENT = 1;

interface HFRow {
  premise: string;
  hypothesis: string;
  label: number;
}

interface CorpusNode {
  id: string;
  pairId: string;
  title: string;
  content: {
    summary: string;
    facts: string[];
    entities: Array<{ name: string; type: string }>;
    raw: string;
  };
  confidence: number;
}

interface GroundTruthPair {
  id: string;
  category: string;
  hasContradiction: boolean;
  docA: string;
  docB: string;
  expectedFinding: {
    type: string;
    minSeverity: string;
    description: string;
  } | null;
}

/** Deterministic shuffle using a simple LCG seeded PRNG. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i]!, result[j]!] = [result[j]!, result[i]!];
  }
  return result;
}

/** Extract simple legal entities from text. */
function extractEntities(
  text: string,
): Array<{ name: string; type: string }> {
  const entities: Array<{ name: string; type: string }> = [];
  const lower = text.toLowerCase();
  if (lower.includes('confidential'))
    entities.push({ name: 'Confidential Information', type: 'clause' });
  if (lower.includes('receiving party') || lower.includes('recipient'))
    entities.push({ name: 'Receiving Party', type: 'legal' });
  if (lower.includes('disclos'))
    entities.push({ name: 'Disclosing Party', type: 'legal' });
  return entities.length > 0
    ? entities
    : [{ name: 'NDA', type: 'legal' }];
}

/** Split text into fact-like sentences. */
function extractFacts(text: string): string[] {
  return text
    .replace(/\n/g, ' ')
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 3);
}

/** Fetch all rows from HuggingFace Dataset Viewer API. */
async function fetchAllRows(): Promise<HFRow[]> {
  const rows: HFRow[] = [];
  let offset = 0;
  while (offset < 2100) {
    const url =
      `${HF_API}?dataset=${DATASET}&config=${CONFIG}` +
      `&split=${SPLIT}&offset=${offset}&length=${BATCH_SIZE}`;
    const resp = await fetch(url);
    const data = (await resp.json()) as {
      rows: Array<{ row: HFRow }>;
    };
    const batch = data.rows ?? [];
    if (batch.length === 0) break;
    rows.push(...batch.map((r) => r.row));
    offset += BATCH_SIZE;
  }
  return rows;
}

/** Build a single node from premise or hypothesis text. */
function buildNode(
  id: string,
  pairId: string,
  title: string,
  text: string,
): CorpusNode {
  const truncated = text.length > 2000 ? text.slice(0, 2000) + '...' : text;
  return {
    id,
    pairId,
    title,
    content: {
      summary:
        truncated.length > 200
          ? truncated.slice(0, 200) + '...'
          : truncated,
      facts: extractFacts(truncated),
      entities: extractEntities(truncated),
      raw: truncated,
    },
    confidence: 0.95,
  };
}

async function main(): Promise<void> {
  const countArg = process.argv.find((a) => a.startsWith('--count='));
  const pairsPerLabel = countArg
    ? Math.floor(parseInt(countArg.split('=')[1]!, 10) / 2)
    : 30;

  console.log('Fetching ContractNLI test split from HuggingFace...');
  const allRows = await fetchAllRows();
  console.log(`Downloaded ${allRows.length} rows`);

  const contradictions = allRows.filter(
    (r) => r.label === LABEL_CONTRADICTION,
  );
  const entailments = allRows.filter((r) => r.label === LABEL_ENTAILMENT);
  console.log(
    `Found ${contradictions.length} contradictions, ` +
      `${entailments.length} entailments`,
  );

  const selectedContradictions = seededShuffle(contradictions, SEED).slice(
    0,
    pairsPerLabel,
  );
  const selectedEntailments = seededShuffle(entailments, SEED).slice(
    0,
    pairsPerLabel,
  );

  const nodes: CorpusNode[] = [];
  const pairs: GroundTruthPair[] = [];

  for (let i = 0; i < selectedContradictions.length; i++) {
    const row = selectedContradictions[i]!;
    const pairId = `contractnli-contradiction-${String(i + 1).padStart(2, '0')}`;
    const premiseId = `contractnli-premise-${String(i + 1).padStart(2, '0')}`;
    const hypId = `contractnli-hypothesis-${String(i + 1).padStart(2, '0')}`;

    nodes.push(
      buildNode(premiseId, pairId, `NDA Clause (Contradiction Pair ${i + 1})`, row.premise),
      buildNode(hypId, pairId, `NDA Hypothesis (Contradiction Pair ${i + 1})`, row.hypothesis),
    );

    pairs.push({
      id: pairId,
      category: 'contractnli',
      hasContradiction: true,
      docA: premiseId,
      docB: hypId,
      expectedFinding: {
        type: 'contradiction',
        minSeverity: 'high',
        description: `NDA premise contradicts hypothesis: ${row.hypothesis.slice(0, 80)}`,
      },
    });
  }

  for (let i = 0; i < selectedEntailments.length; i++) {
    const row = selectedEntailments[i]!;
    const pairId = `contractnli-entailment-${String(i + 1).padStart(2, '0')}`;
    const premiseId = `contractnli-ent-premise-${String(i + 1).padStart(2, '0')}`;
    const hypId = `contractnli-ent-hypothesis-${String(i + 1).padStart(2, '0')}`;

    nodes.push(
      buildNode(premiseId, pairId, `NDA Clause (Entailment Pair ${i + 1})`, row.premise),
      buildNode(hypId, pairId, `NDA Hypothesis (Entailment Pair ${i + 1})`, row.hypothesis),
    );

    pairs.push({
      id: pairId,
      category: 'contractnli',
      hasContradiction: false,
      docA: premiseId,
      docB: hypId,
      expectedFinding: null,
    });
  }

  const outDir = resolve(
    import.meta.dirname ?? '.',
    '..',
    'packages/eval/fixtures/contractnli-corpus',
  );
  mkdirSync(outDir, { recursive: true });

  const groundTruth = {
    corpus: 'contractnli-benchmark-v1',
    description:
      `${pairs.length} NDA premise-hypothesis pairs from ContractNLI ` +
      `(EMNLP 2021) for external benchmark validation. ` +
      `${selectedContradictions.length} contradictions + ` +
      `${selectedEntailments.length} entailment hard negatives.`,
    pairs,
  };

  writeFileSync(
    resolve(outDir, 'ground-truth.json'),
    JSON.stringify(groundTruth, null, 2) + '\n',
  );
  writeFileSync(
    resolve(outDir, 'nodes.json'),
    JSON.stringify(nodes, null, 2) + '\n',
  );

  console.log(`Wrote ${pairs.length} pairs to ${outDir}/ground-truth.json`);
  console.log(`Wrote ${nodes.length} nodes to ${outDir}/nodes.json`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
