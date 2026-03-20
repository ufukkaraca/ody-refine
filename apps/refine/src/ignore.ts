/**
 * .ody-refine-ignore file parser and matcher.
 * Supports glob patterns for suppressing false positives.
 * @module ignore
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Detection } from '@useody/platform-core';

/** A parsed ignore rule. */
interface IgnoreRule {
  /** The original pattern string. */
  pattern: string;
  /** Detection type to match (e.g., 'contradiction', 'time_bomb'). */
  type?: string;
  /** Text pattern (case-insensitive substring match). */
  text?: string;
  /** Node ID prefix to match. */
  nodeId?: string;
}

/**
 * Load ignore rules from .ody-refine-ignore file.
 * File format (one rule per line):
 *   # comment
 *   type:contradiction           # ignore all contradictions
 *   text:rate limit              # ignore detections mentioning "rate limit"
 *   node:abc123                  # ignore detections involving node ID starting with abc123
 *   type:time_bomb text:Q1 2025  # ignore time bombs mentioning "Q1 2025"
 */
export function loadIgnoreRules(directory: string): IgnoreRule[] {
  const candidates = [
    join(directory, '.ody-refine-ignore'),
    join(directory, '.odyignore'),
  ];

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      return parseIgnoreFile(readFileSync(filePath, 'utf-8'));
    }
  }

  return [];
}

/** Parse ignore file content into rules. */
export function parseIgnoreFile(content: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const rule: IgnoreRule = { pattern: line };
    const parts = line.split(/\s+/);

    for (const part of parts) {
      if (part.startsWith('type:')) {
        rule.type = part.slice(5).toLowerCase();
      } else if (part.startsWith('text:')) {
        rule.text = part.slice(5).toLowerCase();
      } else if (part.startsWith('node:')) {
        rule.nodeId = part.slice(5);
      } else {
        // Bare word treated as text pattern
        rule.text = (rule.text ? rule.text + ' ' : '') + part.toLowerCase();
      }
    }

    rules.push(rule);
  }

  return rules;
}

/** Check if a detection matches a single ignore rule. */
function matchesRule(detection: Detection, rule: IgnoreRule): boolean {
  if (rule.type && detection.type !== rule.type) return false;
  if (rule.text) {
    const desc = detection.description.toLowerCase();
    if (!desc.includes(rule.text)) return false;
  }
  if (rule.nodeId) {
    const hasMatch = detection.nodeIds.some((id) => id.startsWith(rule.nodeId!));
    if (!hasMatch) return false;
  }
  return true;
}

/**
 * Filter detections using ignore rules.
 * Returns only detections that do NOT match any ignore rule.
 */
export function applyIgnoreRules(
  detections: Detection[],
  rules: IgnoreRule[],
): Detection[] {
  if (rules.length === 0) return detections;
  return detections.filter((d) => !rules.some((r) => matchesRule(d, r)));
}
