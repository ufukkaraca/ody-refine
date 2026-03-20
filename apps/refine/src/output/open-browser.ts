/**
 * Utility to open HTML reports in the default browser.
 * Skips when running in CI, non-interactive, or test mode.
 * @module output/open-browser
 */

/**
 * Open an HTML file in the user's default browser.
 * Skips silently when:
 * - CI=true (automated environments)
 * - stdout is not a TTY (piped output, background agents)
 */
export async function openHtmlReport(filePath: string): Promise<void> {
  if (process.env.CI) return;
  if (!process.stdout.isTTY) return;

  try {
    const open = (await import('open')).default;
    await open(filePath);
  } catch {
    // Silently ignore — opening browser is best-effort
  }
}
