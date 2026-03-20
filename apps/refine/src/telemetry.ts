/**
 * Opt-in anonymous telemetry for ody-refine.
 * Telemetry is OFF by default. Enable via ODY_TELEMETRY=1 env var
 * or by creating ~/.ody/telemetry-consent file.
 * NO PII is ever collected — no paths, no contents, no identity.
 * @module telemetry
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getVersion } from './run-pipeline-helpers.js';

/** Directory for Ody config and telemetry data. */
const ODY_DIR = join(homedir(), '.ody');

/** Path to the consent marker file. */
const CONSENT_FILE = join(ODY_DIR, 'telemetry-consent');

/** Path to the local telemetry log. */
const TELEMETRY_LOG = join(ODY_DIR, 'telemetry.jsonl');

/** Telemetry event names. */
export type TelemetryEvent = 'scan_started' | 'scan_completed';

/** Payload for scan_started event. */
export interface ScanStartedPayload {
  detector_names: string[];
}

/** Payload for scan_completed event. */
export interface ScanCompletedPayload {
  file_count: number;
  node_count: number;
  issue_count: number;
  duration_ms: number;
  detector_names: string[];
}

/** A recorded telemetry entry. */
export interface TelemetryEntry {
  event: TelemetryEvent;
  timestamp: string;
  version: string;
  payload: ScanStartedPayload | ScanCompletedPayload;
}

/** Check whether telemetry is opted in. */
export function isEnabled(): boolean {
  if (process.env['ODY_TELEMETRY'] === '1') return true;
  return existsSync(CONSENT_FILE);
}

/** Enable telemetry by creating the consent file. */
export function enable(): void {
  mkdirSync(ODY_DIR, { recursive: true });
  writeFileSync(CONSENT_FILE, 'opted-in\n', 'utf-8');
}

/** Disable telemetry by removing the consent file. */
export function disable(): void {
  if (existsSync(CONSENT_FILE)) {
    unlinkSync(CONSENT_FILE);
  }
}

/** Get a human-readable status string. */
export function statusText(): string {
  const envSet = process.env['ODY_TELEMETRY'] === '1';
  const fileSet = existsSync(CONSENT_FILE);
  if (envSet && fileSet) return 'enabled (env + consent file)';
  if (envSet) return 'enabled (ODY_TELEMETRY=1)';
  if (fileSet) return 'enabled (consent file)';
  return 'disabled (opt-in: set ODY_TELEMETRY=1 or run `ody-refine telemetry on`)';
}

/**
 * Record a telemetry event. Does nothing if telemetry is disabled.
 * Events are appended to ~/.ody/telemetry.jsonl as one JSON line each.
 */
export function record(
  event: TelemetryEvent,
  payload: ScanStartedPayload | ScanCompletedPayload,
): void {
  if (!isEnabled()) return;

  const entry: TelemetryEntry = {
    event,
    timestamp: new Date().toISOString(),
    version: getVersion(),
    payload,
  };

  try {
    mkdirSync(ODY_DIR, { recursive: true });
    appendFileSync(TELEMETRY_LOG, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Telemetry must never break the CLI — silently ignore write errors
  }
}

/** Read all recorded telemetry entries (for debugging/status). */
export function readLog(): TelemetryEntry[] {
  if (!existsSync(TELEMETRY_LOG)) return [];
  try {
    const lines = readFileSync(TELEMETRY_LOG, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    return lines.map((l) => JSON.parse(l) as TelemetryEntry);
  } catch {
    return [];
  }
}
