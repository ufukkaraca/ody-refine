/**
 * Utility to open HTML reports in the default browser.
 * @module output/open-browser
 */

/**
 * Open an HTML file in the user's default browser.
 * Uses the 'open' package for cross-platform support.
 */
export async function openHtmlReport(filePath: string): Promise<void> {
  const open = (await import('open')).default;
  await open(filePath);
}
