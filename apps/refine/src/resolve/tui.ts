/**
 * Main Ink React component for the resolve TUI.
 * Shows detections one at a time; user picks keep / dismiss / resolve.
 * @module tui
 */

import React from 'react';
import { Text, Box } from 'ink';
import SelectInput from 'ink-select-input';
import type { Detection } from '@useody/platform-core';
import { DetectionCard, defaultActions } from './tui-components.js';

const h = React.createElement;

/** A resolution decision made by the user. */
export interface Resolution {
  detection: Detection;
  action: string;
}

/** Props for the ResolveTui component. */
export interface ResolveTuiProps {
  detections: Detection[];
  onComplete: (resolutions: Resolution[]) => void;
}

/** State for the ResolveTui component. */
interface ResolveState {
  currentIndex: number;
  resolutions: Resolution[];
}

/**
 * Main resolve TUI component.
 * Presents detections one at a time with keep/dismiss/resolve actions.
 */
export function ResolveTui(props: ResolveTuiProps): React.ReactElement {
  const { detections, onComplete } = props;

  const [state, setState] = React.useState<ResolveState>({
    currentIndex: 0,
    resolutions: [],
  });

  const handleSelect = React.useCallback(
    (item: { label: string; value: unknown }): void => {
      const detection = detections[state.currentIndex];
      if (!detection) return;

      const action = typeof item.value === 'string' ? item.value : String(item.value);
      const resolution: Resolution = { detection, action };
      const updated = [...state.resolutions, resolution];
      const nextIndex = state.currentIndex + 1;

      if (nextIndex >= detections.length) {
        onComplete(updated);
        setState({ currentIndex: nextIndex, resolutions: updated });
      } else {
        setState({ currentIndex: nextIndex, resolutions: updated });
      }
    },
    [detections, state, onComplete],
  );

  if (detections.length === 0) {
    return h(
      Box,
      { flexDirection: 'column', padding: 1 },
      h(Text, { color: 'green', bold: true }, 'No detections to resolve.'),
    );
  }

  if (state.currentIndex >= detections.length) {
    return h(
      Box,
      { flexDirection: 'column', padding: 1 },
      h(
        Text,
        { color: 'green', bold: true },
        `Done! Resolved ${String(state.resolutions.length)} detection(s).`,
      ),
    );
  }

  const current = detections[state.currentIndex];
  if (!current) {
    return h(Box, null, h(Text, { color: 'red' }, 'Unexpected state'));
  }

  return h(
    Box,
    { flexDirection: 'column', padding: 1 },
    h(
      Text,
      { bold: true, underline: true },
      'Ody Refine — Interactive Resolve',
    ),
    h(DetectionCard, {
      detection: current,
      index: state.currentIndex,
      total: detections.length,
    }),
    h(Box, { marginTop: 1 }, h(Text, { bold: true }, 'Choose an action:')),
    h(SelectInput, {
      items: defaultActions,
      onSelect: handleSelect,
    }),
  );
}
