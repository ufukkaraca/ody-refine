/**
 * LLM-augmented contradiction detection using structured context packages.
 * Sends entity-grouped context to an LLM for chain-of-thought analysis.
 * Runs after heuristic detectors as an enrichment layer.
 * @module detectors/llm-augmented
 */
import type {
  Detection,
  KnowledgeNode,
  KnowledgeEdge,
  LLMProvider,
  ChatMessage,
  ContextPackage,
} from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';
import { completeWithTimeout } from './helpers/llm-timeout.js';
import { buildContextPackages } from './context-packager.js';
import { buildSourceMeta } from './context-packager.js';
import { adjustSeverity } from './source-authority.js';
import { LLM_BATCH_SIZE, NLI_TIMEOUT_MS, pairKey } from './prompts.js';

/** Structured finding from LLM chain-of-thought analysis. */
interface AugmentedFinding {
  isContradiction: boolean;
  nodeIdA: string;
  nodeIdB: string;
  topic: string;
  claimA: string;
  claimB: string;
  severity: 'critical' | 'warning';
  reasoning: string;
}

/** Build the system prompt for chain-of-thought contradiction analysis. */
function buildSystemPrompt(): string {
  return [
    'You are an expert knowledge auditor analyzing a set of related documents.',
    'Your task: find REAL contradictions between documents in this context package.',
    '',
    'THINK STEP BY STEP:',
    '1. Identify the key entities and topics shared across documents',
    '2. For each shared topic, extract what each document claims',
    '3. Compare claims — are any INCOMPATIBLE (both cannot be true)?',
    '4. For real contradictions, identify which specific documents conflict',
    '',
    'A contradiction requires BOTH documents to make ACTIVE, EXPLICIT,',
    'INCOMPATIBLE claims about the SAME specific thing.',
    '',
    'COMMON CONTRADICTION PATTERNS:',
    '- Policy conflicts: "remote-first" vs "must be in office", opposing rules',
    '- Ownership conflicts: different teams claimed as owner/responsible for same service',
    '- Number conflicts: different counts, limits, thresholds for same metric',
    '- Timeline conflicts: different deadlines or launch dates for same project',
    '',
    'NOT contradictions: gaps (one doc silent), different topics,',
    'complementary info, general vs specific.',
    '',
    'Return ONLY valid JSON array (may be empty):',
    '[{"isContradiction":true,"nodeIdA":"id","nodeIdB":"id",',
    '"topic":"specific thing","claimA":"what A says","claimB":"what B says",',
    '"severity":"critical|warning","reasoning":"step-by-step why"}]',
  ].join('\n');
}

/** Format a context package into a user prompt for LLM analysis. */
function formatPackagePrompt(pkg: ContextPackage): string {
  const parts: string[] = [
    `Topic cluster: ${pkg.topic}`,
    `Shared entities: ${pkg.sharedEntities.join(', ')}`,
    '',
  ];

  for (const node of pkg.nodes) {
    const meta = pkg.sourceMetadata.find((m) => m.nodeId === node.id);
    parts.push(`--- Document: "${node.title}" [id: ${node.id}] ---`);
    if (meta) {
      parts.push(`Source: ${meta.sourceType}${meta.author ? ` by ${meta.author}` : ''}${meta.authorRole ? ` (${meta.authorRole})` : ''}`);
    }
    if (node.content.facts?.length) {
      parts.push('Facts:');
      for (const fact of node.content.facts) {
        parts.push(`  - ${fact}`);
      }
    }
    if (node.content.summary) {
      parts.push(`Summary: ${node.content.summary}`);
    }
    parts.push('');
  }

  parts.push('Find all contradictions between these documents. Return JSON array.');
  return parts.join('\n');
}

/**
 * Analyze a single context package with LLM chain-of-thought reasoning.
 * Returns detected contradictions with reasoning traces.
 */
async function analyzePackage(
  pkg: ContextPackage,
  llm: LLMProvider,
): Promise<AugmentedFinding[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: formatPackagePrompt(pkg) },
  ];

  const response = await completeWithTimeout(
    llm,
    messages,
    { temperature: 0, maxTokens: 1024 },
    NLI_TIMEOUT_MS,
  );
  if (!response) return [];

  const parsed = parseLlmJsonResponse<AugmentedFinding[]>(response);
  if (!parsed.data || !Array.isArray(parsed.data)) return [];

  // Validate each finding has required fields
  return parsed.data.filter(
    (f): f is AugmentedFinding =>
      f !== null &&
      typeof f === 'object' &&
      f.isContradiction === true &&
      typeof f.nodeIdA === 'string' &&
      typeof f.nodeIdB === 'string' &&
      typeof f.topic === 'string' &&
      typeof f.claimA === 'string' &&
      typeof f.claimB === 'string',
  );
}

/**
 * Run LLM-augmented detection on context packages.
 * Processes packages in batches for concurrency control.
 */
export async function detectAugmented(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  llm: LLMProvider,
  existingSeen: Set<string>,
): Promise<Detection[]> {
  const packages = buildContextPackages(nodes, edges);
  if (packages.length === 0) return [];

  const detections: Detection[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Process packages in batches of LLM_BATCH_SIZE
  for (let i = 0; i < packages.length; i += LLM_BATCH_SIZE) {
    const batch = packages.slice(i, i + LLM_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((pkg) => analyzePackage(pkg, llm)),
    );

    for (let j = 0; j < batch.length; j++) {
      const pkg = batch[j]!;
      const findings = results[j] ?? [];

      for (const finding of findings) {
        const key = pairKey(finding.nodeIdA, finding.nodeIdB);

        // Validate node IDs exist in the package
        const nodeA = nodeMap.get(finding.nodeIdA);
        const nodeB = nodeMap.get(finding.nodeIdB);
        if (!nodeA || !nodeB) continue;

        // Deduplicate: if already seen by heuristic, skip
        if (existingSeen.has(key)) continue;
        existingSeen.add(key);

        // Apply source authority adjustment
        const metaA = pkg.sourceMetadata.find(
          (m) => m.nodeId === finding.nodeIdA,
        ) ?? buildSourceMeta(nodeA);
        const metaB = pkg.sourceMetadata.find(
          (m) => m.nodeId === finding.nodeIdB,
        ) ?? buildSourceMeta(nodeB);

        const baseSeverity = finding.severity === 'critical'
          ? 'critical' as const
          : 'warning' as const;
        const severity = adjustSeverity(baseSeverity, metaA, metaB);

        detections.push({
          type: 'contradiction',
          severity,
          nodeIds: [finding.nodeIdA, finding.nodeIdB],
          description: `[LLM-augmented] ${finding.topic}: "${nodeA.title}" states "${finding.claimA}" — but "${nodeB.title}" states "${finding.claimB}"`,
          suggestedAction: `Review and align "${nodeA.title}" and "${nodeB.title}" on ${finding.topic}.`,
          metadata: {
            claimA: finding.claimA,
            claimB: finding.claimB,
            topic: finding.topic,
            reasoning: finding.reasoning,
            detector: 'llm-augmented',
          },
        });
      }
    }
  }

  return detections;
}
