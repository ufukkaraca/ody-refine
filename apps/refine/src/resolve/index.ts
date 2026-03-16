/**
 * Resolve module — interactive TUI and auto-resolve for detections.
 * @module resolve
 */

export { autoResolve } from './auto-resolve.js';
export type { AutoResolveResult } from './auto-resolve.js';
export { ResolveTui } from './tui.js';
export type { Resolution, ResolveTuiProps } from './tui.js';
export { DetectionCard, ActionBar, defaultActions } from './tui-components.js';
export type {
  DetectionCardProps,
  ActionBarProps,
  ActionOption,
} from './tui-components.js';
