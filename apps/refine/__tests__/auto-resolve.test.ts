/**
 * Tests for auto-resolve logic.
 */
import { describe, it, expect } from 'vitest';
import { autoResolve } from '../src/resolve/auto-resolve.js';
import type { Detection } from '@useody/platform-core';

function makeDetection(
  severity: 'critical' | 'warning' | 'info',
  metadata?: Record<string, unknown>,
): Detection {
  return {
    type: 'contradiction',
    severity,
    nodeIds: ['n1', 'n2'],
    description: `${severity} detection`,
    suggestedAction: 'fix it',
    metadata,
  };
}

describe('autoResolve', () => {
  it('auto-resolves info severity detections', () => {
    const { resolved, remaining } = autoResolve([
      makeDetection('info'),
      makeDetection('critical'),
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.severity).toBe('info');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.severity).toBe('critical');
  });

  it('auto-resolves when autoResolvable metadata is true', () => {
    const { resolved, remaining } = autoResolve([
      makeDetection('warning', { autoResolvable: true }),
      makeDetection('warning'),
    ]);
    expect(resolved).toHaveLength(1);
    expect(remaining).toHaveLength(1);
  });

  it('auto-resolves when autoResolve metadata is true', () => {
    const { resolved } = autoResolve([
      makeDetection('critical', { autoResolve: true }),
    ]);
    expect(resolved).toHaveLength(1);
  });

  it('does not auto-resolve critical without metadata flag', () => {
    const { resolved, remaining } = autoResolve([
      makeDetection('critical'),
    ]);
    expect(resolved).toHaveLength(0);
    expect(remaining).toHaveLength(1);
  });

  it('returns all as remaining when no auto-resolvable', () => {
    const { resolved, remaining } = autoResolve([
      makeDetection('critical'),
      makeDetection('warning'),
    ]);
    expect(resolved).toHaveLength(0);
    expect(remaining).toHaveLength(2);
  });

  it('handles empty input', () => {
    const { resolved, remaining } = autoResolve([]);
    expect(resolved).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });
});
