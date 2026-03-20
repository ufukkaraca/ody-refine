/**
 * Resolve module — interactive TUI and auto-resolve for detections.
 *
 * The Ink-based TUI components (ResolveTui, DetectionCard, ActionBar) require
 * the optional `ink`, `react`, and `ink-select-input` dependencies.
 * Import them directly from `./tui.js` and `./tui-components.js` if needed.
 *
 * @module resolve
 */

export { autoResolve } from './auto-resolve.js';
export type { AutoResolveResult } from './auto-resolve.js';
// Re-export only types from Ink-dependent modules (no runtime import).
export type { Resolution, ResolveTuiProps } from './tui.js';
export type {
  DetectionCardProps,
  ActionBarProps,
  ActionOption,
} from './tui-components.js';
export { runInteractiveResolve, generatePrompt } from './resolve-interactive.js';
export type {
  NodeInfo,
  InteractiveResolution,
  InteractiveResolveOptions,
  AskFn,
} from './resolve-interactive.js';
export { llmAutoResolve } from './llm-auto-resolve.js';
export { saveResolutions, countResolutions } from './save-resolutions.js';
export type { ResolutionRecord } from './save-resolutions.js';
export { persistResolutions } from './save-pairs.js';
