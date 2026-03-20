import { describe, it, expect } from 'vitest';
import { determineConsensusStrategy } from '../src/run-pipeline-helpers.js';

describe('determineConsensusStrategy', () => {
  it('disables consensus for < 10 nodes', () => {
    const strategy = determineConsensusStrategy(6);
    expect(strategy.enabled).toBe(false);
    expect(strategy.reason).toContain('Small doc set');
    expect(strategy.reason).toContain('6 nodes');
  });

  it('uses relaxed consensus (minVotes=1) for 10-20 nodes', () => {
    const strategy = determineConsensusStrategy(15);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBe(1);
    expect(strategy.reason).toContain('Small doc set');
    expect(strategy.reason).toContain('15 nodes');
  });

  it('uses default consensus for > 20 nodes with many files', () => {
    const strategy = determineConsensusStrategy(25, undefined, 50);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBeUndefined();
    expect(strategy.reason).toBeUndefined();
  });

  it('uses default consensus for exactly 20 nodes (boundary)', () => {
    const strategy = determineConsensusStrategy(20);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBe(1);
  });

  it('disables consensus for exactly 10 nodes (boundary)', () => {
    const strategy = determineConsensusStrategy(10);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBe(1);
  });

  it('disables consensus for exactly 9 nodes', () => {
    const strategy = determineConsensusStrategy(9);
    expect(strategy.enabled).toBe(false);
  });

  it('uses relaxed consensus for dense doc sets (few files, many nodes)', () => {
    const strategy = determineConsensusStrategy(155, undefined, 5);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBe(1);
    expect(strategy.reason).toContain('Medium doc set');
    expect(strategy.reason).toContain('5 files');
    expect(strategy.reason).toContain('155 nodes');
  });

  it('uses relaxed consensus for 12 files / 235 nodes (real docs case)', () => {
    const strategy = determineConsensusStrategy(235, undefined, 12);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBe(1);
    expect(strategy.reason).toContain('Medium doc set');
    expect(strategy.reason).toContain('12 files');
  });

  it('uses relaxed consensus for < 15 files regardless of node count', () => {
    const strategy = determineConsensusStrategy(50, undefined, 14);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBe(1);
  });

  it('uses relaxed consensus for < 20 files with > 100 nodes (dense)', () => {
    const strategy = determineConsensusStrategy(150, undefined, 18);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBe(1);
    expect(strategy.reason).toContain('Medium doc set');
  });

  it('uses default consensus for < 20 files with <= 100 nodes', () => {
    const strategy = determineConsensusStrategy(50, undefined, 18);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBeUndefined();
  });

  it('uses default consensus when file count is large', () => {
    const strategy = determineConsensusStrategy(155, undefined, 50);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBeUndefined();
  });

  it('respects explicit --no-consensus override', () => {
    const strategy = determineConsensusStrategy(50, false);
    expect(strategy.enabled).toBe(false);
    expect(strategy.reason).toBeUndefined();
  });

  it('respects explicit --consensus override for small sets', () => {
    const strategy = determineConsensusStrategy(3, true);
    expect(strategy.enabled).toBe(true);
    expect(strategy.minVotes).toBeUndefined();
  });

  it('respects explicit --consensus override for large sets', () => {
    const strategy = determineConsensusStrategy(100, true);
    expect(strategy.enabled).toBe(true);
    expect(strategy.reason).toBeUndefined();
  });

  it('disables consensus for 1 node', () => {
    const strategy = determineConsensusStrategy(1);
    expect(strategy.enabled).toBe(false);
  });
});
