/**
 * Tests for GitHub Action and workflow YAML validity.
 * Validates structure, required fields, and input/output definitions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Root of the repo (two levels up from apps/refine). */
const ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** Read a YAML file and return its content as a string. */
function readYaml(relativePath: string): string {
  const fullPath = resolve(ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Expected file not found: ${fullPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

describe('GitHub Action: .github/actions/refine/action.yml', () => {
  const content = readYaml('.github/actions/refine/action.yml');

  it('exists and is not empty', () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it('has required action metadata', () => {
    expect(content).toContain("name: 'Ody Refine'");
    expect(content).toContain('description:');
    expect(content).toContain('runs:');
    expect(content).toContain("using: 'composite'");
  });

  it('defines the path input', () => {
    expect(content).toContain('path:');
    expect(content).toContain("default: './docs'");
  });

  it('defines the fail-on input with critical default', () => {
    expect(content).toContain('fail-on:');
    expect(content).toContain("default: 'critical'");
  });

  it('defines the min-health input', () => {
    expect(content).toContain('min-health:');
    expect(content).toContain("default: '70'");
  });

  it('defines the provider input', () => {
    expect(content).toContain('provider:');
    expect(content).toContain("default: 'none'");
  });

  it('defines outputs for score and pass', () => {
    expect(content).toContain('score:');
    expect(content).toContain('pass:');
    expect(content).toContain('report-path:');
  });

  it('runs npx ody-refine ci', () => {
    expect(content).toContain('npx ody-refine ci');
  });

  it('uses actions/setup-node@v4', () => {
    expect(content).toContain('actions/setup-node@v4');
  });

  it('uses actions/github-script for PR comments', () => {
    expect(content).toContain('actions/github-script@v7');
    expect(content).toContain('Ody Refine Health Report');
  });

  it('passes fail-on input to CLI', () => {
    expect(content).toContain('--fail-on');
    expect(content).toContain("inputs.fail-on");
  });

  it('fails the step when pass is false', () => {
    expect(content).toContain("steps.refine.outputs.pass == 'false'");
    expect(content).toContain('exit 1');
  });
});

describe('Reusable workflow: .github/workflows/ody-refine.yml', () => {
  const content = readYaml('.github/workflows/ody-refine.yml');

  it('exists and is not empty', () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it('is a reusable workflow (workflow_call trigger)', () => {
    expect(content).toContain('workflow_call:');
  });

  it('defines path input', () => {
    expect(content).toContain('path:');
    expect(content).toContain("default: './docs'");
  });

  it('defines fail-on input', () => {
    expect(content).toContain('fail-on:');
    expect(content).toContain("default: 'critical'");
  });

  it('defines outputs for score and pass', () => {
    expect(content).toContain('score:');
    expect(content).toContain('pass:');
  });

  it('runs npx ody-refine ci', () => {
    expect(content).toContain('npx ody-refine ci');
  });

  it('uploads report artifact', () => {
    expect(content).toContain('actions/upload-artifact@v4');
    expect(content).toContain('refine-report');
  });

  it('adds PR comment with health report', () => {
    expect(content).toContain('Ody Refine Health Report');
  });
});

describe('Example workflow: .github/workflows/docs-health.yml', () => {
  const content = readYaml('.github/workflows/docs-health.yml');

  it('exists and is not empty', () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it('has workflow_dispatch trigger (auto-triggers disabled until ody-refine is published)', () => {
    expect(content).toContain('workflow_dispatch:');
  });

  it('calls the reusable workflow', () => {
    expect(content).toContain('./.github/workflows/ody-refine.yml');
  });

  it('passes fail-on critical', () => {
    expect(content).toContain("fail-on: 'critical'");
  });
});
