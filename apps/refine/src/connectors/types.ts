// EXCEEDS_LIMIT: type definitions file — interfaces, error classes, and enrichment types
/**
 * Connector type definitions for Ody Refine.
 * Every data source connector implements RefineConnector.
 * Supports read (audit) and write-back (fix) operations.
 * @module connectors/types
 */

// --- Document Model ---

/**
 * A document normalized from any source into Refine's universal format.
 * Maps to the existing ingest pipeline: content → chunk → embed → KnowledgeNode.
 */
export interface ConnectorDocument {
  /** Stable source-system identifier (e.g. "notion:page:abc-123"). */
  id: string;
  /** Human-readable document title. */
  title: string;
  /** Markdown-normalized body content. */
  content: string;
  /** Connector name that produced this document. */
  sourceType: string;
  /** Deep link back to the source system. */
  sourceUrl?: string;
  /** When the source document was last modified. */
  lastModified?: Date;
  /** Last editor's email or username. */
  author?: string;
  /** Source-specific metadata (space keys, parent IDs, labels, etc.). */
  metadata: Record<string, unknown> & {
    /** Breadcrumb chain from root to this document's parent. */
    parentChain?: ParentRef[];
    /** Hints for the analysis/detection pipeline. */
    analysisHints?: AnalysisHints;
  };
}

// --- Authentication ---

/** Supported authentication methods. */
export type AuthMethod = 'api-key' | 'oauth' | 'bot-token';

/** Configuration for authenticating with a source system. */
export interface ConnectorAuth {
  /** Auth method used. */
  method: AuthMethod;
  /** API key, access token, or bot token. */
  token: string;
  /** OAuth refresh token (for automatic renewal). */
  refreshToken?: string;
  /** Token expiry timestamp. */
  expiresAt?: Date;
  /** Additional auth parameters (workspace ID, base URL, etc.). */
  params?: Record<string, string>;
}

// --- Source Browsing ---

/** A browsable source within a connected system (database, channel, space). */
export interface ConnectorSource {
  /** Source-system ID (e.g., Notion database ID, Slack channel ID). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Source category (e.g., "database", "channel", "space", "project"). */
  type: string;
  /** Approximate document count (for progress estimation). */
  estimatedDocCount?: number;
}

// --- Progress & Results ---

/** Progress event emitted during connector operations. */
export interface ConnectorProgress {
  phase: 'auth' | 'discover' | 'fetch' | 'sync' | 'write-back';
  current: number;
  total: number;
  message?: string;
}

/** Result of a write-back operation (pushing corrections to source). */
export interface WriteBackResult {
  /** The document that was updated. */
  documentId: string;
  /** Whether the write succeeded. */
  success: boolean;
  /** URL to the updated document in the source system. */
  updatedUrl?: string;
  /** Error message if the write failed. */
  error?: string;
}

// --- Cursor-Based Sync ---

/** Cursor types supported by connectors. */
export type SyncCursorType = 'timestamp' | 'page-token' | 'change-token' | 'offset';

/** Cursor for incremental sync — each connector produces its own cursor format. */
export interface SyncCursor {
  /** Kind of cursor (determines how the value is interpreted). */
  type: SyncCursorType;
  /** The actual cursor value (ISO timestamp, page token, etc.). */
  value: string;
  /** Connector that produced this cursor. */
  connectorName: string;
  /** ISO datetime of when this cursor was last used. */
  updatedAt?: string;
}

/** A single change yielded by incremental sync. */
export interface SyncChange {
  /** The document that changed. */
  document: ConnectorDocument;
  /** Whether the document was created/updated or deleted. */
  action: 'upsert' | 'delete';
}

// --- Core Connector Interface ---

/**
 * The core connector interface. Every data source implements this.
 * Supports the full audit-and-fix lifecycle:
 *   authenticate → listSources → fetchDocuments → fetchChanges → writeBack
 */
export interface RefineConnector {
  /** Unique connector identifier (e.g., "notion", "slack"). */
  readonly name: string;
  /** Human-readable display name (e.g., "Notion", "Slack"). */
  readonly displayName: string;
  /** Supported authentication methods for this source. */
  readonly authMethods: AuthMethod[];
  /** Whether this connector supports writing corrections back to the source. */
  readonly supportsWriteBack: boolean;

  /**
   * Authenticate with the source system.
   * Validates credentials and stores them for subsequent calls.
   * @throws {ConnectorAuthError} if credentials are invalid
   */
  authenticate(auth: ConnectorAuth): Promise<void>;

  /**
   * List available sources (databases, channels, spaces, etc.).
   * Used to let users pick which sources to sync.
   */
  listSources(): Promise<ConnectorSource[]>;

  /**
   * Fetch all documents from the specified sources.
   * Yields documents as they are fetched (async generator for backpressure).
   */
  fetchDocuments(
    sources: ConnectorSource[],
    onProgress?: (event: ConnectorProgress) => void,
  ): AsyncGenerator<ConnectorDocument, void, unknown>;

  /**
   * Fetch changes incrementally using a cursor.
   * Without a cursor, performs a full sync. With a cursor, fetches only
   * documents changed since the cursor position.
   */
  fetchChanges(
    cursor?: SyncCursor,
  ): AsyncGenerator<SyncChange, void, unknown>;

  /**
   * Return a cursor representing the current point in time.
   * Save this after a successful sync to resume from here next time.
   */
  getInitialCursor(): SyncCursor;

  /**
   * Write a correction back to the source document.
   * Only available when supportsWriteBack is true.
   */
  writeBack?(
    documentId: string,
    correctedContent: string,
    reason: string,
  ): Promise<WriteBackResult>;

  /**
   * Validate that current credentials are still valid.
   * @returns true if authenticated, false if re-authentication is needed
   */
  validate(): Promise<boolean>;
}

// --- Errors ---

/** Error thrown when a connector operation fails. */
export class ConnectorError extends Error {
  constructor(
    public readonly connectorName: string,
    public readonly operation: string,
    message: string,
  ) {
    super(`[${connectorName}] ${operation} failed: ${message}`);
    this.name = 'ConnectorError';
  }
}

/** Error thrown when connector authentication fails. */
export class ConnectorAuthError extends ConnectorError {
  constructor(connectorName: string, message: string) {
    super(connectorName, 'Auth', message);
    this.name = 'ConnectorAuthError';
  }
}

/** Error thrown when a connector hits a rate limit. */
export class ConnectorRateLimitError extends ConnectorError {
  constructor(
    connector: string,
    public readonly retryAfter?: number,
  ) {
    super(connector, 'rate-limit', `Rate limited${retryAfter ? ` (retry after ${String(retryAfter)}s)` : ''}`);
    this.name = 'ConnectorRateLimitError';
  }
}

/** Error thrown when an OAuth/API token has expired. */
export class ConnectorTokenExpiredError extends ConnectorError {
  constructor(
    connector: string,
    public readonly refreshable: boolean,
  ) {
    super(connector, 'token-expired', `Token expired (${refreshable ? 'refreshable' : 'not refreshable'})`);
    this.name = 'ConnectorTokenExpiredError';
  }
}

/** Error thrown when the source system returns a server error (5xx). */
export class ConnectorServerError extends ConnectorError {
  constructor(
    connector: string,
    public readonly statusCode: number,
  ) {
    super(connector, 'server-error', `Server returned ${String(statusCode)}`);
    this.name = 'ConnectorServerError';
  }
}

/** Error thrown when a specific entity fails to process. */
export class ConnectorEntityError extends ConnectorError {
  constructor(
    connector: string,
    public readonly entityId: string,
    public readonly cause: string,
  ) {
    super(connector, 'entity-error', `Entity ${entityId}: ${cause}`);
    this.name = 'ConnectorEntityError';
  }
}

// --- Document Enrichment ---

/** A reference to a parent in the source hierarchy (breadcrumb). */
export interface ParentRef {
  /** Parent type (e.g. 'workspace', 'project', 'channel', 'space'). */
  type: string;
  /** Human-readable name (e.g. 'Engineering', '#product-ops'). */
  name: string;
  /** Optional external ID. */
  id?: string;
}

/** Hints for the analysis/detection pipeline. */
export interface AnalysisHints {
  /** How dense the document is with factual claims. */
  factDensity?: 'high' | 'normal' | 'low';
  /** Whether this is an authoritative source (official policy, not discussion). */
  authoritative?: boolean;
}
