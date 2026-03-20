/**
 * Ink sub-components for the resolve TUI.
 * Uses React.createElement since this is a .ts file (no JSX).
 * @module tui-components
 */

import React from 'react';
import { Text, Box } from 'ink';
import type { Detection } from '@useody/platform-core';

const h = React.createElement;

/** Color map for severity levels. */
const severityColor: Record<string, string> = {
  critical: 'red',
  warning: 'yellow',
  info: 'blue',
};

/** Props for DetectionCard component. */
export interface DetectionCardProps {
  detection: Detection;
  index: number;
  total: number;
}

/**
 * Displays a single detection with severity badge, description, and suggested action.
 */
export function DetectionCard(props: DetectionCardProps): React.ReactElement {
  const { detection, index, total } = props;
  const color = severityColor[detection.severity] ?? 'white';

  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    h(
      Box,
      null,
      h(Text, { bold: true, dimColor: true }, `[${String(index + 1)}/${String(total)}] `),
      h(Text, { bold: true, color }, `[${detection.severity.toUpperCase()}] `),
      h(Text, { bold: true }, detection.type),
    ),
    h(Box, { marginLeft: 2 }, h(Text, null, detection.description)),
    detection.suggestedAction
      ? h(
          Box,
          { marginLeft: 2 },
          h(Text, { dimColor: true }, `Suggestion: ${detection.suggestedAction}`),
        )
      : null,
    h(
      Box,
      { marginLeft: 2 },
      h(
        Text,
        { dimColor: true },
        `Nodes: ${detection.nodeIds.join(', ')}`,
      ),
    ),
  );
}

/** Action option for the action bar. */
export interface ActionOption {
  label: string;
  value: string;
}

/** Default action options. */
export const defaultActions: ActionOption[] = [
  { label: 'Keep (mark as known issue)', value: 'keep' },
  { label: 'Dismiss (false positive)', value: 'dismiss' },
  { label: 'Resolve (fixed)', value: 'resolve' },
];

/** Props for ActionBar component. */
export interface ActionBarProps {
  actions: ActionOption[];
}

/**
 * Displays available action options as a list.
 */
export function ActionBar(props: ActionBarProps): React.ReactElement {
  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    h(Text, { bold: true }, 'Choose an action:'),
    ...props.actions.map((a) =>
      h(
        Box,
        { key: a.value, marginLeft: 1 },
        h(Text, null, `  ${a.label}`),
      ),
    ),
  );
}
