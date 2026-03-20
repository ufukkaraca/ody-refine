/**
 * Thin wrapper around Modal web endpoints for remote training.
 * Calls Modal web endpoints over HTTPS — no Python SDK dependency from Node.
 * Auth via MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, and MODAL_WORKSPACE env vars.
 * @module training/modal-client
 */

/** Modal API credentials. */
export interface ModalCredentials {
  tokenId: string;
  tokenSecret: string;
}

/** Status of a Modal function call. */
export type ModalFunctionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

/** Response from creating a Modal function call. */
export interface ModalFunctionCall {
  functionCallId: string;
  status: ModalFunctionStatus;
}

/** Result of a completed Modal function call. */
export interface ModalFunctionResult {
  functionCallId: string;
  status: ModalFunctionStatus;
  output?: string;
  error?: string;
}

/** Options for the Modal client. */
export interface ModalClientOptions {
  credentials?: ModalCredentials;
  /** Modal workspace name. Falls back to MODAL_WORKSPACE env var. */
  workspace?: string;
  /** Full web endpoint URL override. Skips workspace-based URL construction. */
  webEndpointUrl?: string;
  /** Logger callback for status updates. */
  logger?: (msg: string) => void;
}

/** Resolve Modal credentials from options or env vars. */
function resolveCredentials(
  opts?: ModalCredentials,
): ModalCredentials {
  const tokenId = opts?.tokenId
    ?? process.env['MODAL_TOKEN_ID']
    ?? '';
  const tokenSecret = opts?.tokenSecret
    ?? process.env['MODAL_TOKEN_SECRET']
    ?? '';
  if (!tokenId || !tokenSecret) {
    throw new Error(
      'Modal credentials required. Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET env vars, ' +
      'or pass credentials explicitly.',
    );
  }
  return { tokenId, tokenSecret };
}

/**
 * Client for invoking Modal web endpoints over HTTPS.
 * Modal functions must be deployed with @modal.web_endpoint() to be callable.
 * Auth uses Modal-Key / Modal-Secret headers (proxy auth tokens).
 */
export class ModalClient {
  private readonly credentials: ModalCredentials;
  private readonly workspace: string;
  private readonly webEndpointUrl: string | undefined;
  private readonly logger: ((msg: string) => void) | undefined;

  constructor(options?: ModalClientOptions) {
    this.credentials = resolveCredentials(options?.credentials);
    this.workspace = options?.workspace
      ?? process.env['MODAL_WORKSPACE']
      ?? '';
    this.webEndpointUrl = options?.webEndpointUrl;
    this.logger = options?.logger;
  }

  /**
   * Build the web endpoint URL for a Modal function.
   * Pattern: https://{workspace}--{appName}-{functionName}.modal.run
   */
  private buildUrl(appName: string, functionName: string): string {
    if (this.webEndpointUrl) return this.webEndpointUrl;
    if (!this.workspace) {
      throw new Error(
        'Modal workspace required. Set MODAL_WORKSPACE env var, pass workspace option, ' +
        'or provide webEndpointUrl directly.',
      );
    }
    return `https://${this.workspace}--${appName}-${functionName}.modal.run`;
  }

  /** Build auth headers for Modal web endpoint proxy auth. */
  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Modal-Key': this.credentials.tokenId,
      'Modal-Secret': this.credentials.tokenSecret,
    };
  }

  /** Safely parse JSON, throwing a descriptive error on non-JSON responses. */
  private parseJson(body: string): Record<string, unknown> {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new Error(
        'Modal response is not valid JSON (likely HTML error page or non-JSON endpoint). ' +
        `Response preview: ${body.slice(0, 200)}`,
      );
    }
  }

  /**
   * Call a Modal web endpoint. Web endpoints are synchronous —
   * the HTTP request blocks until the function completes.
   * Returns a ModalFunctionCall with the final status.
   */
  async createFunctionCall(
    appName: string,
    functionName: string,
    input: Record<string, unknown>,
  ): Promise<ModalFunctionCall> {
    const result = await this.callAndWait(appName, functionName, input);
    return {
      functionCallId: result.functionCallId,
      status: result.status,
    };
  }

  /**
   * Get function call status.
   * Web endpoints complete synchronously, so this always returns 'completed'.
   */
  async getFunctionCallStatus(
    functionCallId: string,
  ): Promise<ModalFunctionResult> {
    return { functionCallId, status: 'completed' };
  }

  /**
   * Wait for completion.
   * Web endpoints complete synchronously, so this returns immediately.
   */
  async waitForCompletion(
    functionCallId: string,
  ): Promise<ModalFunctionResult> {
    return { functionCallId, status: 'completed' };
  }

  /**
   * Call a Modal web endpoint and return the full result.
   * This is the primary method — POSTs input, waits for the response.
   */
  async callAndWait(
    appName: string,
    functionName: string,
    input: Record<string, unknown>,
  ): Promise<ModalFunctionResult> {
    const url = this.buildUrl(appName, functionName);
    this.logger?.(`Calling Modal endpoint: ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(input),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `Modal API error (${response.status}): ${body.slice(0, 500)}`,
      );
    }

    const data = this.parseJson(body);
    const error = typeof data['error'] === 'string'
      ? data['error']
      : undefined;

    return {
      functionCallId: crypto.randomUUID(),
      status: error ? 'failed' : 'completed',
      output: body,
      error,
    };
  }
}
