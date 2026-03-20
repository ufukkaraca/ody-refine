/**
 * Credential store — persists OAuth tokens in macOS Keychain.
 * Falls back to ~/.ody/credentials.json with chmod 600.
 * @module connectors/credential-store
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * ODY_CREDENTIAL_DIR overrides the default credential directory and
 * disables Keychain lookup — used in tests to isolate from real credentials.
 */
const ODY_DIR = process.env['ODY_CREDENTIAL_DIR'] ?? join(homedir(), '.ody');
const CREDENTIALS_FILE = join(ODY_DIR, 'credentials.json');
const KEYCHAIN_SERVICE = 'ody-refine';
const USE_KEYCHAIN = !process.env['ODY_CREDENTIAL_DIR'];

/** Stored credential shape. */
export interface StoredCredential {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  workspaceId?: string;
  workspaceName?: string;
  expiresAt?: number;
  connectedAt: string;
}

/** Store a credential in macOS Keychain, falling back to file. */
export async function storeCredential(cred: StoredCredential): Promise<void> {
  const payload = JSON.stringify(cred);

  if (USE_KEYCHAIN && process.platform === 'darwin') {
    try {
      // Delete existing entry (ignore errors if not found)
      try {
        execFileSync('security', [
          'delete-generic-password',
          '-s', KEYCHAIN_SERVICE,
          '-a', cred.provider,
        ], { stdio: 'pipe' });
      } catch {
        // Entry didn't exist — that's fine
      }

      execFileSync('security', [
        'add-generic-password',
        '-s', KEYCHAIN_SERVICE,
        '-a', cred.provider,
        '-w', payload,
        '-U', // Update if exists
      ], { stdio: 'pipe' });
      return;
    } catch {
      // Fall through to file storage
    }
  }

  // Fallback: file-based storage
  ensureOdyDir();
  const existing = loadCredentialsFile();
  existing[cred.provider] = cred;
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(existing, null, 2), {
    mode: 0o600,
  });
}

/** Retrieve a credential by provider name. */
export async function getCredential(
  provider: string,
): Promise<StoredCredential | null> {
  if (USE_KEYCHAIN && process.platform === 'darwin') {
    try {
      const result = execFileSync('security', [
        'find-generic-password',
        '-s', KEYCHAIN_SERVICE,
        '-a', provider,
        '-w',
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      return JSON.parse(result.trim()) as StoredCredential;
    } catch {
      // Not in keychain — try file fallback
    }
  }

  const creds = loadCredentialsFile();
  return (creds[provider] as StoredCredential) ?? null;
}

/** Remove a credential by provider name. */
export async function removeCredential(provider: string): Promise<boolean> {
  let removed = false;

  if (USE_KEYCHAIN && process.platform === 'darwin') {
    try {
      execFileSync('security', [
        'delete-generic-password',
        '-s', KEYCHAIN_SERVICE,
        '-a', provider,
      ], { stdio: 'pipe' });
      removed = true;
    } catch {
      // Not in keychain
    }
  }

  const creds = loadCredentialsFile();
  if (creds[provider]) {
    delete creds[provider];
    ensureOdyDir();
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
      mode: 0o600,
    });
    removed = true;
  }

  return removed;
}

/** Ensure ~/.ody directory exists. */
function ensureOdyDir(): void {
  if (!existsSync(ODY_DIR)) {
    mkdirSync(ODY_DIR, { mode: 0o700, recursive: true });
  }
}

/** Load credentials file, returning empty object if missing/corrupt. */
function loadCredentialsFile(): Record<string, unknown> {
  try {
    if (!existsSync(CREDENTIALS_FILE)) return {};
    const raw = readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
