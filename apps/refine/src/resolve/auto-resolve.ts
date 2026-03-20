/**
 * Auto-resolve high-confidence detections.
 * @module auto-resolve
 */

import type { Detection } from '@useody/platform-core';

/** Result of auto-resolution: resolved detections and remaining ones. */
export interface AutoResolveResult {
  resolved: Detection[];
  remaining: Detection[];
}

/** Check whether a detection is auto-resolvable. */
function isAutoResolvable(detection: Detection): boolean {
  if (detection.severity === 'info') return true;

  const meta = detection.metadata;
  if (!meta) return false;

  if (typeof meta['autoResolvable'] === 'boolean') {
    return meta['autoResolvable'];
  }
  if (typeof meta['autoResolve'] === 'boolean') {
    return meta['autoResolve'];
  }

  return false;
}

/**
 * Auto-resolve high-confidence detections.
 * Resolves detections where severity is 'info' OR metadata contains
 * auto-resolvable hints (autoResolvable or autoResolve = true).
 */
export function autoResolve(detections: Detection[]): AutoResolveResult {
  const resolved: Detection[] = [];
  const remaining: Detection[] = [];

  for (const d of detections) {
    if (isAutoResolvable(d)) {
      resolved.push(d);
    } else {
      remaining.push(d);
    }
  }

  return { resolved, remaining };
}
