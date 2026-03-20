/**
 * Resolve command — launches interactive or auto resolve for detected issues.
 * Saves preference pairs to SQLite and optionally exports to JSONL.
 * @module commands/resolve
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config/index.js';
import { detectLlmProvider } from '../config/auto-detect.js';
import { createSpinner } from '../output/index.js';
import { loadDetections } from '../detect/detection-store.js';
import type { Detection } from '@useody/platform-core';
import type { InteractiveResolution, NodeInfo } from '../resolve/resolve-interactive.js';
import type { RefineConfig } from '../config/schema.js';

/** CLI options for the resolve command. */
interface ResolveOpts {
  config?: string;
  auto?: boolean;
  output?: string;
}

/** Create the resolve command. */
export function createResolveCommand(): Command {
  return new Command('resolve')
    .description('Interactively resolve detected issues')
    .option('--config <path>', 'Path to config file')
    .option('--auto', 'Auto-resolve using LLM')
    .option('--output <path>', 'Export preference pairs to JSONL file')
    .addHelpText('after', `
Examples:
  $ ody-refine resolve                 Interactive resolve for each issue
  $ ody-refine resolve --auto          Auto-resolve contradictions via LLM
  $ ody-refine resolve --output pairs.jsonl   Export pairs to JSONL

Requires a prior 'ody-refine ingest' run.
`)
    .action(async (opts: ResolveOpts) => {
      await runResolve(opts);
    });
}

/** Run the resolve flow. */
async function runResolve(opts: ResolveOpts): Promise<void> {
  const spinner = createSpinner('Loading detections...');
  spinner.start();

  const config = loadConfig(opts.config);
  const dbPath = resolve(config.dataDir, 'refine.db');

  if (!existsSync(dbPath)) {
    spinner.fail(
      `No database found at ${dbPath}. Run 'ody-refine ingest' first.`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    const core = await import('@useody/platform-core');
    const db = core.openDatabase(dbPath);

    const row = db.prepare(
      'SELECT embedding_dim FROM knowledge_nodes LIMIT 1',
    ).get() as { embedding_dim: number } | undefined;
    core.createSchema(db, row?.embedding_dim ?? 384);

    const cached = loadDetections(db as never);
    if (!cached || cached.length === 0) {
      spinner.fail(
        "No cached detections found. Run 'ody-refine ingest' first.",
      );
      process.exitCode = 1;
      return;
    }

    spinner.succeed(`Found ${String(cached.length)} detection(s)`);

    const nodeLookup = await buildNodeLookup(core, db);

    let resolutions: InteractiveResolution[];

    if (opts.auto) {
      resolutions = await runAutoResolve(cached, nodeLookup, config);
    } else if (!process.stdin.isTTY) {
      printNonTtyFallback(cached);
      return;
    } else {
      resolutions = await runInteractive(cached, nodeLookup);
    }

    const { persistResolutions } = await import(
      '../resolve/save-pairs.js'
    );
    await persistResolutions(db, resolutions, opts.output);
    db.close();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    spinner.fail(`Resolve failed: ${msg}`);
    process.exitCode = 1;
  }
}

/** Build the node ID -> {title, raw} lookup map. */
async function buildNodeLookup(
  core: typeof import('@useody/platform-core'),
  db: unknown,
): Promise<Map<string, NodeInfo>> {
  const nodeRepo = new core.SQLiteNodeRepository(
    db as ReturnType<typeof core.openDatabase>,
  );
  const allNodes = await nodeRepo.findAll();
  const lookup = new Map<string, NodeInfo>();
  for (const node of allNodes) {
    lookup.set(node.id, {
      title: node.title,
      raw: node.content.raw ?? node.content.summary,
    });
  }
  return lookup;
}

/** Run auto-resolve: heuristic first, then LLM for contradictions. */
async function runAutoResolve(
  detections: Detection[],
  nodeLookup: Map<string, NodeInfo>,
  config: RefineConfig,
): Promise<InteractiveResolution[]> {
  const { autoResolve } = await import('../resolve/auto-resolve.js');
  const { resolved: trivial, remaining } = autoResolve(detections);

  const results: InteractiveResolution[] = trivial.map((d) => ({
    detection: d,
    action: 'dismiss' as const,
  }));

  if (trivial.length > 0) {
    process.stdout.write(
      `  Auto-dismissed ${String(trivial.length)} info-level issue(s).\n`,
    );
  }

  if (remaining.length === 0) return results;

  try {
    const llm = await detectLlmProvider(config);
    if (!llm) {
      throw new Error('No LLM provider available. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or install Ollama.');
    }
    const { llmAutoResolve } = await import(
      '../resolve/llm-auto-resolve.js'
    );
    const llmResults = await llmAutoResolve(
      remaining, nodeLookup, llm,
      (msg) => process.stdout.write(msg + '\n'),
    );
    results.push(...llmResults);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`  LLM unavailable (${msg}). Skipping.\n`);
    for (const d of remaining) {
      results.push({ detection: d, action: 'skip' });
    }
  }

  return results;
}

/** Run interactive readline resolve. */
async function runInteractive(
  detections: Detection[],
  nodeLookup: Map<string, NodeInfo>,
): Promise<InteractiveResolution[]> {
  const { runInteractiveResolve } = await import(
    '../resolve/resolve-interactive.js'
  );
  return runInteractiveResolve({ detections, nodeLookup });
}

/** Print non-TTY fallback listing. */
function printNonTtyFallback(detections: Detection[]): void {
  process.stdout.write(
    `${String(detections.length)} issue(s) require interactive resolution.\n`,
  );
  for (const d of detections) {
    process.stdout.write(
      `  [${d.severity}] ${d.type}: ${d.description}\n`,
    );
  }
  process.stdout.write(
    'Run in an interactive terminal or use --auto.\n',
  );
}
