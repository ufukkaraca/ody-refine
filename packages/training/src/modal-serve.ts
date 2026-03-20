/**
 * TypeScript wrapper for deploying and managing Modal serving endpoints.
 * Deploys the Python Modal app and returns the serving URL.
 * @module training/modal-serve
 */

import { execFile } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Logger callback for serving status updates. */
export type ServeLogger = (msg: string) => void;

/** Options for deploying a Modal serving endpoint. */
export interface ModalServeOptions {
  /** Modal workspace name. Falls back to MODAL_WORKSPACE env var. */
  workspace?: string;
  /** Modal app name. Defaults to 'ody-serving'. */
  appName?: string;
  /** Base model HuggingFace ID. Defaults to 'Qwen/Qwen2.5-7B-Instruct'. */
  baseModel?: string;
  /** Path to the LoRA adapter inside the Modal volume. */
  adapterPath?: string;
  /** Logger callback. */
  logger?: ServeLogger;
}

/** Result of a deploy operation. */
export interface ModalServeResult {
  /** The full URL of the deployed endpoint. */
  url: string;
  /** The Modal app name. */
  appName: string;
}

/** Default Modal app name for serving. */
export const DEFAULT_SERVE_APP_NAME = 'ody-serving';

/** Default endpoint label used in modal-serve.py. */
const ENDPOINT_LABEL = 'v1-chat-completions';

/**
 * Parse the serving endpoint URL from `modal deploy` stdout.
 * Modal prints lines like:
 *   Created web endpoint https://workspace--ody-serving-v1-chat-completions.modal.run
 * or:
 *   https://workspace--ody-serving-v1-chat-completions.modal.run
 */
export function parseServingUrl(output: string): string | undefined {
  const urlPattern = /https:\/\/[^\s]+modal\.run[^\s]*/;
  const match = output.match(urlPattern);
  return match?.[0];
}

/**
 * Build the expected serving URL from workspace and app name.
 * Pattern: https://{workspace}--{appName}-{endpointLabel}.modal.run
 */
export function buildServingUrl(
  workspace: string,
  appName?: string,
): string {
  const app = appName ?? DEFAULT_SERVE_APP_NAME;
  return `https://${workspace}--${app}-${ENDPOINT_LABEL}.modal.run`;
}

/**
 * Build the `modal deploy` command arguments.
 * Exported for testing.
 */
export function buildDeployArgs(
  scriptPath: string,
  options?: Pick<ModalServeOptions, 'baseModel' | 'adapterPath'>,
): string[] {
  const args = ['deploy', scriptPath];
  if (options?.baseModel) {
    args.push('--env', `ODY_BASE_MODEL=${options.baseModel}`);
  }
  if (options?.adapterPath) {
    args.push('--env', `ODY_ADAPTER_PATH=${options.adapterPath}`);
  }
  return args;
}

/**
 * Deploy the Modal serving endpoint.
 * Shells out to `modal deploy` and parses the resulting URL.
 */
export async function deployServing(
  options?: ModalServeOptions,
): Promise<ModalServeResult> {
  const workspace = options?.workspace
    ?? process.env['MODAL_WORKSPACE']
    ?? '';
  const appName = options?.appName ?? DEFAULT_SERVE_APP_NAME;
  const logger = options?.logger;

  if (!workspace) {
    throw new Error(
      'Modal workspace required. Set MODAL_WORKSPACE env var or pass workspace option.',
    );
  }

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const scriptPath = resolve(thisDir, 'modal-serve.py');
  const args = buildDeployArgs(scriptPath, options);

  logger?.(`Deploying Modal serving app: modal ${args.join(' ')}`);

  const url = await new Promise<string>((resolveP, reject) => {
    execFile('modal', args, { timeout: 300_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(
          `modal deploy failed: ${error.message}\nstderr: ${stderr}`,
        ));
        return;
      }

      const combined = `${stdout}\n${stderr}`;
      const parsed = parseServingUrl(combined);

      if (parsed) {
        resolveP(parsed);
      } else {
        // Fall back to constructed URL
        logger?.('Could not parse URL from Modal output, using constructed URL.');
        resolveP(buildServingUrl(workspace, appName));
      }
    });
  });

  logger?.(`Serving endpoint deployed: ${url}`);

  return { url, appName };
}

/**
 * Get the expected serving URL for a model without deploying.
 * Useful when the endpoint is already deployed and you need the URL.
 */
export function getServingUrl(
  modelId: string,
  options?: Pick<ModalServeOptions, 'workspace' | 'appName'>,
): string {
  const workspace = options?.workspace
    ?? process.env['MODAL_WORKSPACE']
    ?? '';

  if (!workspace) {
    throw new Error(
      'Modal workspace required. Set MODAL_WORKSPACE env var or pass workspace option.',
    );
  }

  const appName = options?.appName ?? `ody-serving-${modelId}`;
  return buildServingUrl(workspace, appName);
}
