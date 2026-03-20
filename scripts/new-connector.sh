#!/usr/bin/env bash
# Usage: bash scripts/new-connector.sh <connector-name>
# Creates: connector.ts, api-client.ts, test file, updates barrel export
#
# Example: bash scripts/new-connector.sh salesforce
#   → apps/refine/src/connectors/salesforce.ts
#   → apps/refine/src/connectors/salesforce-api.ts
#   → apps/refine/__tests__/salesforce-connector.test.ts
#   → Updates apps/refine/src/connectors/index.ts

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/new-connector.sh <connector-name>"
  echo "  e.g. bash scripts/new-connector.sh salesforce"
  exit 1
fi

NAME="$1"
DISPLAY_NAME="$(echo "$NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')"
CLASS_NAME="$(echo "$DISPLAY_NAME" | sed 's/ //g')Connector"
API_CLASS="$(echo "$DISPLAY_NAME" | sed 's/ //g')ApiClient"
UPPER_NAME="$(echo "$NAME" | tr '[:lower:]-' '[:upper:]_')"

CONNECTORS_DIR="apps/refine/src/connectors"
TESTS_DIR="apps/refine/__tests__"
INDEX_FILE="$CONNECTORS_DIR/index.ts"

# Check we're in the repo root
if [ ! -f "$INDEX_FILE" ]; then
  echo "Error: Run from the platform repo root (where apps/refine exists)."
  exit 1
fi

# Check connector doesn't already exist
if [ -f "$CONNECTORS_DIR/$NAME.ts" ]; then
  echo "Error: $CONNECTORS_DIR/$NAME.ts already exists."
  exit 1
fi

echo "Creating connector: $NAME ($DISPLAY_NAME)"

# --- API Client ---
cat > "$CONNECTORS_DIR/$NAME-api.ts" << APIEOF
/** $DISPLAY_NAME API client with rate limiting and retry. */
import {
  ConnectorError, ConnectorAuthError,
  ConnectorRateLimitError, ConnectorServerError,
} from './types.js';
import { withConnectorRetry } from './retry.js';

const BASE_URL = 'https://api.example.com'; // TODO: replace with real API URL
const MAX_RETRIES = 3;

/** $DISPLAY_NAME item from the API. */
export interface ${DISPLAY_NAME// /}Item {
  id: string;
  name: string;
  content: string;
  updatedAt?: string;
  url?: string;
}

/** $DISPLAY_NAME API client. Bearer-token auth. */
export class $API_CLASS {
  constructor(private readonly token: string) {}

  /** Validate token by calling a lightweight endpoint. */
  async validateToken(): Promise<boolean> {
    try {
      await this.apiFetch<{ ok: boolean }>(\`\${BASE_URL}/me\`);
      return true;
    } catch { return false; }
  }

  /** List available sources/collections. */
  async listSources(): Promise<Array<{ id: string; name: string }>> {
    const data = await this.apiFetch<{
      items: Array<{ id: string; name: string }>;
    }>(\`\${BASE_URL}/sources\`);
    return data.items ?? [];
  }

  /** Fetch items from a source. */
  async fetchItems(sourceId: string): Promise<${DISPLAY_NAME// /}Item[]> {
    const data = await this.apiFetch<{
      items: ${DISPLAY_NAME// /}Item[];
    }>(\`\${BASE_URL}/sources/\${sourceId}/items\`);
    return data.items ?? [];
  }

  /** Rate-limited, retried API fetch via withConnectorRetry. */
  private async apiFetch<T>(url: string): Promise<T> {
    return withConnectorRetry(async () => {
      const response = await fetch(url, {
        headers: { Authorization: \`Bearer \${this.token}\` },
      });
      if (response.status === 401) {
        throw new ConnectorAuthError('$NAME', 'HTTP 401 Unauthorized');
      }
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
        throw new ConnectorRateLimitError('$NAME', retryAfter);
      }
      if (response.status >= 500) {
        throw new ConnectorServerError('$NAME', response.status);
      }
      if (!response.ok) {
        throw new ConnectorError(
          '$NAME', 'apiFetch', \`HTTP \${response.status} \${response.statusText}\`,
        );
      }
      return (await response.json()) as T;
    }, { maxRetries: MAX_RETRIES });
  }
}
APIEOF

# --- Connector Implementation ---
cat > "$CONNECTORS_DIR/$NAME.ts" << CONNEOF
/**
 * $DISPLAY_NAME connector for Ody Refine.
 * Auth: API key or OAuth. Env fallback: ${UPPER_NAME}_TOKEN.
 * @module connectors/$NAME
 */
import type {
  RefineConnector, ConnectorAuth, ConnectorSource, ConnectorDocument,
  ConnectorProgress, WriteBackResult, AuthMethod, SyncCursor, SyncChange,
} from './types.js';
import { ConnectorAuthError } from './types.js';
import { $API_CLASS } from './$NAME-api.js';

/**
 * $DISPLAY_NAME connector — reads items and converts to markdown documents.
 * Write-back: not supported.
 */
export class $CLASS_NAME implements RefineConnector {
  readonly name = '$NAME';
  readonly displayName = '$DISPLAY_NAME';
  readonly authMethods: AuthMethod[] = ['api-key'];
  readonly supportsWriteBack = false;

  private client: $API_CLASS | null = null;

  async authenticate(auth: ConnectorAuth): Promise<void> {
    const token = auth.token || process.env['${UPPER_NAME}_TOKEN'];
    if (!token) {
      throw new ConnectorAuthError(
        '$NAME', 'Token required. Set ${UPPER_NAME}_TOKEN or pass auth.token.',
      );
    }
    const client = new $API_CLASS(token);
    if (!await client.validateToken()) {
      throw new ConnectorAuthError('$NAME', 'Invalid token or insufficient permissions');
    }
    this.client = client;
  }

  async listSources(): Promise<ConnectorSource[]> {
    const client = this.ensureClient();
    const sources = await client.listSources();
    return sources.map((s) => ({ id: s.id, name: s.name, type: 'collection' }));
  }

  async *fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown> {
    const client = this.ensureClient();
    let processed = 0;
    for (const source of sources) {
      onProgress?.({
        phase: 'fetch', current: processed, total: sources.length,
        message: \`Scanning: \${source.name}...\`,
      });
      const items = await client.fetchItems(source.id);
      for (const item of items) {
        if (item.content.length < 20) continue;
        yield {
          id: \`$NAME:item:\${item.id}\`,
          title: item.name,
          content: item.content,
          sourceType: '$NAME',
          sourceUrl: item.url,
          lastModified: item.updatedAt ? new Date(item.updatedAt) : undefined,
          metadata: { sourceId: source.id },
        };
      }
      processed++;
    }
  }

  getInitialCursor(): SyncCursor {
    return {
      type: 'timestamp',
      value: new Date().toISOString(),
      connectorName: '$NAME',
      updatedAt: new Date().toISOString(),
    };
  }

  async *fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown> {
    // TODO: implement incremental sync using cursor
    void cursor;
  }

  async writeBack(
    documentId: string, _correctedContent: string, _reason: string,
  ): Promise<WriteBackResult> {
    return { documentId, success: false, error: 'Write-back is not supported for $DISPLAY_NAME.' };
  }

  async validate(): Promise<boolean> {
    if (!this.client) return false;
    return this.client.validateToken();
  }

  private ensureClient(): $API_CLASS {
    if (!this.client) {
      throw new ConnectorAuthError('$NAME', 'Not authenticated. Call authenticate() first.');
    }
    return this.client;
  }
}
CONNEOF

# --- Test File ---
cat > "$TESTS_DIR/$NAME-connector.test.ts" << TESTEOF
/**
 * Tests for the $DISPLAY_NAME connector.
 * Mocks fetch — no actual API access required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { $CLASS_NAME as ${CLASS_NAME}Type } from '../src/connectors/$NAME.js';

describe('$CLASS_NAME', () => {
  let connector: ${CLASS_NAME}Type;

  async function createConnector(): Promise<${CLASS_NAME}Type> {
    const mod = await import('../src/connectors/$NAME.js');
    return new mod.$CLASS_NAME();
  }

  afterEach(() => { vi.unstubAllGlobals(); });

  it('has correct connector metadata', async () => {
    connector = await createConnector();
    expect(connector.name).toBe('$NAME');
    expect(connector.displayName).toBe('$DISPLAY_NAME');
    expect(connector.supportsWriteBack).toBe(false);
  });

  it('throws ConnectorAuthError when not authenticated', async () => {
    connector = await createConnector();
    await expect(connector.listSources()).rejects.toThrow('Not authenticated');
  });

  it('validate returns false when not authenticated', async () => {
    connector = await createConnector();
    expect(await connector.validate()).toBe(false);
  });

  it('throws ConnectorAuthError when token is missing', async () => {
    connector = await createConnector();
    await expect(
      connector.authenticate({ method: 'api-key', token: '' }),
    ).rejects.toThrow('Token required');
  });

  it('writeBack returns not-supported error', async () => {
    connector = await createConnector();
    const result = await connector.writeBack('$NAME:item:1', 'corrected', 'reason');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not supported');
  });
});
TESTEOF

# --- Update barrel export ---
if ! grep -q "$CLASS_NAME" "$INDEX_FILE"; then
  # Insert import after the last connector import (GitHubConnector)
  sed -i '' "/^import { GitHubConnector }/a\\
import { $CLASS_NAME } from './$NAME.js';
" "$INDEX_FILE"

  # Insert export after the GitHubConnector export
  sed -i '' "/^export { GitHubConnector }/a\\
export { $CLASS_NAME } from './$NAME.js';
" "$INDEX_FILE"

  # Insert into factory map after github entry
  sed -i '' "/  'github': () => new GitHubConnector(),/a\\
  '$NAME': () => new $CLASS_NAME(),
" "$INDEX_FILE"

  echo "Updated $INDEX_FILE with $CLASS_NAME"
fi

echo ""
echo "Created:"
echo "  $CONNECTORS_DIR/$NAME-api.ts     (API client)"
echo "  $CONNECTORS_DIR/$NAME.ts         (connector)"
echo "  $TESTS_DIR/$NAME-connector.test.ts  (tests)"
echo ""
echo "Next steps:"
echo "  1. Update the API client with real URLs and types"
echo "  2. Implement fetchChanges() for incremental sync"
echo "  3. Add $NAME to CONNECTOR_INFO in index.ts"
echo "  4. Add to ENV_TOKEN_MAP in resolve-credential.ts"
echo "  5. Add OAuth config in oauth-configs.ts (if OAuth)"
echo "  6. Run: pnpm build && pnpm test"
