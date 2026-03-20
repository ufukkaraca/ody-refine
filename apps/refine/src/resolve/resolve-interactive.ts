/**
 * Readline-based interactive resolver.
 * Shows each finding, collects user input, returns preference pairs.
 * Works without Ink/React — pure Node.js readline.
 * @module resolve/resolve-interactive
 */
import * as readline from 'node:readline';
import type { Detection, PreferencePair } from '@useody/platform-core';

/** A node lookup entry for displaying context. */
export interface NodeInfo {
  title: string;
  raw: string;
}

/** User resolution for a single detection. */
export interface InteractiveResolution {
  detection: Detection;
  action: 'resolve' | 'skip' | 'dismiss';
  pair?: PreferencePair;
}

/** Function type for asking questions (injectable for testing). */
export type AskFn = (question: string) => Promise<string>;

/** Options for the interactive resolver. */
export interface InteractiveResolveOptions {
  detections: Detection[];
  nodeLookup: Map<string, NodeInfo>;
  /** Override for stdin (testing). */
  input?: NodeJS.ReadableStream;
  /** Override for stdout (testing). */
  output?: NodeJS.WritableStream;
  /** Inject a custom ask function (testing). */
  askFn?: AskFn;
}

/** Extract a relevant snippet from raw text. */
function snippet(raw: string, maxLen = 160): string {
  const trimmed = raw.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

/** Generate a natural question from a contradiction detection. */
export function generatePrompt(detection: Detection): string {
  const desc = detection.description.toLowerCase();
  if (desc.includes('rate limit') || desc.includes('requests')) {
    return 'What is the correct rate limit?';
  }
  if (desc.includes('expir') || desc.includes('hour')) {
    return 'What is the correct timeframe?';
  }
  if (desc.includes('number') || desc.includes('value')) {
    return 'What is the correct value?';
  }
  if (desc.includes('policy') || desc.includes('process')) {
    return 'Which policy is current?';
  }
  return 'Which version is correct?';
}

/** Create a readline-based ask function. */
function createReadlineAsk(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): { ask: AskFn; close: () => void } {
  const rl = readline.createInterface({
    input,
    output,
    terminal: false,
  });

  const ask: AskFn = (question: string) =>
    new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });

  return { ask, close: () => rl.close() };
}

/** Build a preference pair from user choice. */
function buildPair(
  d: Detection,
  chosenNode: NodeInfo | undefined,
  rejectedNode: NodeInfo | undefined,
): PreferencePair {
  return {
    prompt: generatePrompt(d),
    chosen: snippet(chosenNode?.raw ?? '', 500),
    rejected: snippet(rejectedNode?.raw ?? '', 500),
    metadata: {
      conflictType: d.type,
      resolvedBy: 'cli-user',
      resolvedAt: new Date(),
      confidence: 1.0,
      sourceNodeIds: d.nodeIds,
    },
  };
}

/**
 * Run the interactive resolve loop.
 * Shows each contradiction, asks the user to pick A/B/skip/dismiss.
 * Returns an array of resolutions with preference pairs.
 */
export async function runInteractiveResolve(
  opts: InteractiveResolveOptions,
): Promise<InteractiveResolution[]> {
  const { detections, nodeLookup } = opts;
  const output = opts.output ?? process.stdout;

  if (detections.length === 0) return [];

  let closeFn: (() => void) | undefined;
  let askFn: AskFn;

  if (opts.askFn) {
    askFn = opts.askFn;
  } else {
    const rl = createReadlineAsk(
      opts.input ?? process.stdin,
      output,
    );
    askFn = rl.ask;
    closeFn = rl.close;
  }

  const resolutions: InteractiveResolution[] = [];
  const write = (text: string): void => { output.write(text); };

  write('\n  Ody Refine — Resolve\n');
  write(`  ${String(detections.length)} detection(s) to review\n\n`);

  for (let i = 0; i < detections.length; i++) {
    const d = detections[i]!;
    const isContradiction =
      d.type === 'contradiction' && d.nodeIds.length >= 2;

    write(`  [${String(i + 1)}/${String(detections.length)}] `);
    write(`[${d.severity.toUpperCase()}] ${d.type}\n`);
    write(`  ${d.description}\n`);

    if (d.suggestedAction) {
      write(`  Suggestion: ${d.suggestedAction}\n`);
    }

    if (isContradiction) {
      const nodeA = nodeLookup.get(d.nodeIds[0]!);
      const nodeB = nodeLookup.get(d.nodeIds[1]!);

      write('\n');
      write(`  [A] ${nodeA?.title ?? 'Source A'}\n`);
      write(`      ${snippet(nodeA?.raw ?? '(no content)')}\n\n`);
      write(`  [B] ${nodeB?.title ?? 'Source B'}\n`);
      write(`      ${snippet(nodeB?.raw ?? '(no content)')}\n\n`);

      const answer = await askFn(
        '  Which is correct? [A] / [B] / [s]kip / [d]ismiss: ',
      );
      const choice = answer.toLowerCase();

      if (choice === 'a' || choice === 'b') {
        const chosenNode = choice === 'a' ? nodeA : nodeB;
        const rejectedNode = choice === 'a' ? nodeB : nodeA;
        const pair = buildPair(d, chosenNode, rejectedNode);
        resolutions.push({ detection: d, action: 'resolve', pair });
        write('  -> Resolved. Training pair created.\n\n');
      } else if (choice === 'd') {
        resolutions.push({ detection: d, action: 'dismiss' });
        write('  -> Dismissed.\n\n');
      } else {
        resolutions.push({ detection: d, action: 'skip' });
        write('  -> Skipped.\n\n');
      }
    } else {
      const answer = await askFn('  Action? [d]ismiss / [s]kip: ');
      const choice = answer.toLowerCase();
      if (choice === 'd') {
        resolutions.push({ detection: d, action: 'dismiss' });
        write('  -> Dismissed.\n\n');
      } else {
        resolutions.push({ detection: d, action: 'skip' });
        write('  -> Skipped.\n\n');
      }
    }
  }

  const pairCount = resolutions.filter((r) => r.pair).length;
  write(`\n  Done! Resolved ${String(resolutions.length)}`);
  write(` detection(s).`);
  if (pairCount > 0) {
    write(` Generated ${String(pairCount)} training pair(s).`);
  }
  write('\n');

  closeFn?.();
  return resolutions;
}
