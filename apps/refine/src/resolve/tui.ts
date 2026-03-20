/**
 * Main Ink React component for the resolve TUI.
 * For contradictions: shows both claims, user picks correct one → generates DPO pair.
 * For other types: keep / dismiss / resolve.
 * @module tui
 */

import React from 'react';
import { Text, Box } from 'ink';
import SelectInput from 'ink-select-input';
import type { Detection, PreferencePair } from '@useody/platform-core';

const h = React.createElement;

/** A resolution decision made by the user. */
export interface Resolution {
  detection: Detection;
  action: string;
  /** For contradictions: the generated preference pair. */
  preferencePair?: PreferencePair;
}

/** Props for the ResolveTui component. */
export interface ResolveTuiProps {
  detections: Detection[];
  /** Node lookup: id → {title, raw text} */
  nodeLookup: Map<string, { title: string; raw: string }>;
  onComplete: (resolutions: Resolution[]) => void;
}

type Phase = 'action' | 'pick-claim';

/** State for the ResolveTui component. */
interface ResolveState {
  currentIndex: number;
  resolutions: Resolution[];
  phase: Phase;
}

/** Extract the relevant sentence/paragraph from a node for a contradiction. */
function extractClaimContext(raw: string, maxLen = 200): string {
  const trimmed = raw.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

/** Generate a natural question from a contradiction's description. */
function generateQuestion(detection: Detection): string {
  const desc = detection.description;
  // "Conflicting numbers: 500 vs 1000" → "What is the correct number?"
  if (desc.includes('Conflicting numbers')) return 'What is the correct value?';
  if (desc.includes('Opposing concepts')) return 'Which policy is current?';
  if (desc.includes('Hour inconsistency')) return 'What is the correct timeframe?';
  return 'Which version is correct?';
}

/**
 * Resolve TUI — the core feedback mechanism.
 * For contradictions, shows both claims and lets user pick the correct one.
 * This generates PreferencePairs that feed into Forge for model training.
 */
export function ResolveTui(props: ResolveTuiProps): React.ReactElement {
  const { detections, nodeLookup, onComplete } = props;

  const [state, setState] = React.useState<ResolveState>({
    currentIndex: 0,
    resolutions: [],
    phase: 'action',
  });

  const current = detections[state.currentIndex];
  const isContradiction = current?.type === 'contradiction' && current.nodeIds.length >= 2;

  const handleAction = React.useCallback(
    (item: { label: string; value: unknown }): void => {
      if (!current) return;
      const action = typeof item.value === 'string' ? item.value : String(item.value);

      if (action === 'resolve' && isContradiction) {
        // Transition to claim-picking phase
        setState((s) => ({ ...s, phase: 'pick-claim' }));
        return;
      }

      // Non-contradiction or keep/dismiss: advance
      const resolution: Resolution = { detection: current, action };
      advance(resolution);
    },
    [current, isContradiction],
  );

  const handleClaimPick = React.useCallback(
    (item: { label: string; value: unknown }): void => {
      if (!current) return;
      const pick = typeof item.value === 'string' ? item.value : String(item.value);

      const nodeA = nodeLookup.get(current.nodeIds[0]!);
      const nodeB = nodeLookup.get(current.nodeIds[1]!);
      if (!nodeA || !nodeB) {
        advance({ detection: current, action: 'resolve' });
        return;
      }

      const chosen = pick === 'A' ? nodeA.raw : pick === 'B' ? nodeB.raw : nodeA.raw;
      const rejected = pick === 'A' ? nodeB.raw : pick === 'B' ? nodeA.raw : nodeB.raw;

      const pair: PreferencePair = {
        prompt: generateQuestion(current),
        chosen: extractClaimContext(chosen, 500),
        rejected: extractClaimContext(rejected, 500),
        metadata: {
          conflictType: 'contradiction',
          resolvedBy: 'cli-user',
          resolvedAt: new Date(),
          confidence: 1.0,
          sourceNodeIds: current.nodeIds,
        },
      };

      advance({ detection: current, action: 'resolve', preferencePair: pair });
    },
    [current, nodeLookup],
  );

  function advance(resolution: Resolution): void {
    const updated = [...state.resolutions, resolution];
    const nextIndex = state.currentIndex + 1;
    if (nextIndex >= detections.length) {
      onComplete(updated);
    }
    setState({ currentIndex: nextIndex, resolutions: updated, phase: 'action' });
  }

  // --- Render ---

  if (detections.length === 0) {
    return h(Box, { flexDirection: 'column', padding: 1 },
      h(Text, { color: 'green', bold: true }, 'No detections to resolve.'));
  }

  if (state.currentIndex >= detections.length) {
    const pairCount = state.resolutions.filter((r) => r.preferencePair).length;
    return h(Box, { flexDirection: 'column', padding: 1 },
      h(Text, { color: 'green', bold: true },
        `Done! Resolved ${String(state.resolutions.length)} detection(s).`),
      pairCount > 0
        ? h(Text, { color: 'cyan' },
            `Generated ${String(pairCount)} training pair(s) for model improvement.`)
        : null);
  }

  if (!current) {
    return h(Box, null, h(Text, { color: 'red' }, 'Unexpected state'));
  }

  // Header
  const header = h(Text, { bold: true, underline: true },
    `Ody Refine — Resolve [${String(state.currentIndex + 1)}/${String(detections.length)}]`);

  // Severity badge
  const sevColor = current.severity === 'critical' ? 'red'
    : current.severity === 'warning' ? 'yellow' : 'blue';
  const badge = h(Box, { marginTop: 1 },
    h(Text, { bold: true, color: sevColor },
      `[${current.severity.toUpperCase()}] `),
    h(Text, { bold: true }, current.type));

  // Description
  const desc = h(Box, { marginLeft: 2 },
    h(Text, null, current.description));

  // Claim-picking phase for contradictions
  if (state.phase === 'pick-claim' && isContradiction) {
    const nodeA = nodeLookup.get(current.nodeIds[0]!);
    const nodeB = nodeLookup.get(current.nodeIds[1]!);

    return h(Box, { flexDirection: 'column', padding: 1 },
      header, badge, desc,
      h(Box, { marginTop: 1, flexDirection: 'column' },
        h(Text, { bold: true, color: 'cyan' }, 'Which version is correct?'),
        h(Box, { marginTop: 1, marginLeft: 2, flexDirection: 'column' },
          h(Text, { bold: true, color: 'green' }, `A: ${nodeA?.title ?? 'Unknown'}`),
          h(Text, { dimColor: true }, `   ${extractClaimContext(nodeA?.raw ?? '', 120)}`)),
        h(Box, { marginTop: 1, marginLeft: 2, flexDirection: 'column' },
          h(Text, { bold: true, color: 'yellow' }, `B: ${nodeB?.title ?? 'Unknown'}`),
          h(Text, { dimColor: true }, `   ${extractClaimContext(nodeB?.raw ?? '', 120)}`))),
      h(Box, { marginTop: 1 },
        h(SelectInput, {
          items: [
            { label: `A is correct (${nodeA?.title ?? '?'})`, value: 'A' },
            { label: `B is correct (${nodeB?.title ?? '?'})`, value: 'B' },
            { label: 'Skip (not sure)', value: 'skip' },
          ],
          onSelect: handleClaimPick,
        })));
  }

  // Default action phase
  const actions = isContradiction
    ? [
        { label: 'Resolve — pick the correct version (generates training data)', value: 'resolve' },
        { label: 'Keep — mark as known issue', value: 'keep' },
        { label: 'Dismiss — false positive', value: 'dismiss' },
      ]
    : [
        { label: 'Keep (mark as known issue)', value: 'keep' },
        { label: 'Dismiss (false positive)', value: 'dismiss' },
        { label: 'Resolve (fixed)', value: 'resolve' },
      ];

  return h(Box, { flexDirection: 'column', padding: 1 },
    header, badge, desc,
    current.suggestedAction
      ? h(Box, { marginLeft: 2 },
          h(Text, { dimColor: true }, `Suggestion: ${current.suggestedAction}`))
      : null,
    h(Box, { marginTop: 1 },
      h(SelectInput, { items: actions, onSelect: handleAction })));
}
