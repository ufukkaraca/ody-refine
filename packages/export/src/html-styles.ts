// EXCEEDS_LIMIT: CSS template string for self-contained HTML report
/**
 * CSS styles for the Ody Refine health report.
 * Warm parchment theme matching the ody_px web app brand.
 * Self-contained — no external resources.
 * @module html-styles
 */

/** Complete CSS stylesheet for the health report. */
export function getReportStyles(): string {
  return `
    :root {
      --bg-root: #f6f1e8;
      --bg-card: #fdfbf8;
      --bg-elevated: #fff;
      --bg-input: #f0ebe2;
      --bg-hover: #eae4d9;
      --accent: #bf5226;
      --accent-muted: rgba(191, 82, 38, 0.08);
      --accent-hover: rgba(191, 82, 38, 0.14);
      --accent-text: #9b3f1a;
      --text-primary: #17110c;
      --text-secondary: #5c4f42;
      --text-muted: #8a7e72;
      --border-default: rgba(20, 15, 10, 0.08);
      --border-hover: rgba(20, 15, 10, 0.14);
      --sev-critical: #c03030;
      --sev-critical-bg: rgba(192, 48, 48, 0.06);
      --sev-warning: #b8860b;
      --sev-warning-bg: rgba(184, 134, 11, 0.06);
      --sev-info: #5c4f42;
      --sev-info-bg: rgba(92, 79, 66, 0.05);
      --color-success: #2d8a54;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
      --font-sans: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-serif: 'Newsreader', Georgia, 'Times New Roman', serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans); background: var(--bg-root);
      color: var(--text-primary); line-height: 1.6;
      padding: 2.5rem 1rem; max-width: 820px; margin: 0 auto;
      -webkit-font-smoothing: antialiased; letter-spacing: -0.01em;
    }
    .report-header { text-align: center; padding: 2.5rem 0 0.75rem; }
    .brand {
      display: inline-flex; align-items: center; gap: 0.5rem;
      font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.15em; color: var(--accent); margin-bottom: 0.75rem;
    }
    .brand-dot {
      width: 7px; height: 7px; background: var(--accent);
      border-radius: 50%; flex-shrink: 0;
    }
    .report-header h1 {
      font-family: var(--font-serif); font-size: 1.75rem;
      font-weight: 600; letter-spacing: -0.02em; color: var(--text-primary);
    }
    .report-header .subtitle {
      color: var(--text-muted); font-size: 0.85rem; margin-top: 0.35rem;
    }
    .score-section { display: flex; justify-content: center; padding: 1.5rem 0 0.5rem; }
    .score-ring text { font-family: var(--font-sans); }
    .score-label {
      text-align: center; font-size: 0.6rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.14em;
      color: var(--text-muted); margin-top: 0.6rem;
    }
    .stats {
      text-align: center; font-size: 0.8rem; color: var(--text-muted);
      margin-bottom: 1.5rem; font-family: var(--font-mono);
    }
    .summary-section {
      background: var(--bg-card); border: 1px solid var(--border-default);
      border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;
      margin-bottom: 2rem; box-shadow: var(--shadow-sm);
    }
    .summary-title {
      font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.14em; color: var(--text-muted); margin-bottom: 1rem;
    }
    .summary-row {
      display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.65rem;
    }
    .summary-row:last-child { margin-bottom: 0; }
    .summary-type {
      width: 110px; font-size: 0.8rem; font-weight: 600;
      color: var(--text-secondary); text-transform: capitalize;
    }
    .summary-bar-track {
      flex: 1; height: 7px; background: var(--bg-input);
      border-radius: 4px; overflow: hidden;
    }
    .summary-bar-fill {
      height: 100%; border-radius: 4px; background: var(--accent);
    }
    .summary-count {
      font-size: 0.8rem; font-weight: 700; color: var(--text-primary);
      font-family: var(--font-mono); min-width: 24px; text-align: right;
    }
    .detections { display: flex; flex-direction: column; gap: 0.75rem; }
    .section-title {
      font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.14em; color: var(--text-muted); margin-bottom: 0.5rem;
    }
    .detection {
      background: var(--bg-card); border: 1px solid var(--border-default);
      border-radius: var(--radius-md); padding: 1rem 1.25rem;
      border-left: 3px solid var(--text-muted); box-shadow: var(--shadow-sm);
    }
    .detection.critical { border-left: 4px solid var(--sev-critical); background: var(--sev-critical-bg); }
    .detection.warning { border-left: 4px solid var(--sev-warning); background: rgba(184, 134, 11, 0.10); }
    .detection.info {
      border-left: 2px solid var(--border-hover);
      background: rgba(92, 79, 66, 0.03); color: var(--text-secondary);
    }
    .detection-header {
      display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem;
    }
    .severity {
      display: inline-block; font-size: 0.6rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
      padding: 2px 8px; border-radius: var(--radius-sm); color: #fff;
    }
    .severity.critical { background: var(--sev-critical); }
    .severity.warning { background: var(--sev-warning); }
    .severity.info { background: var(--sev-info); }
    .detection .type {
      font-weight: 600; font-size: 0.8rem;
      color: var(--text-secondary); text-transform: capitalize;
    }
    .detection .desc { font-size: 0.85rem; line-height: 1.6; }
    .headline { font-weight: 600; font-size: 0.9rem; color: var(--text-primary); }
    .detection-files { margin: 0.4rem 0; display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .claims-grid {
      display: grid; grid-template-columns: 1fr auto 1fr;
      gap: 0.5rem; align-items: stretch; margin: 0.6rem 0;
    }
    .claim {
      padding: 0.6rem 0.75rem; border-radius: var(--radius-sm);
      background: var(--bg-input); font-size: 0.82rem;
    }
    .claim-a { border-left: 3px solid var(--sev-warning); }
    .claim-b { border-left: 3px solid var(--sev-info); }
    .claim-source { font-size: 0.7rem; font-weight: 600; color: var(--accent-text); margin-bottom: 0.25rem; }
    .claim-source a { color: var(--accent-text); text-decoration: underline; }
    .claim-text { color: var(--text-primary); font-style: italic; }
    .claim-vs {
      display: flex; align-items: center; font-weight: 700;
      font-size: 0.75rem; color: var(--text-muted); padding: 0 0.25rem;
    }
    .impact {
      font-size: 0.8rem; color: var(--text-secondary);
      margin-top: 0.4rem; padding-left: 0.5rem;
      border-left: 2px solid var(--accent-text);
      font-style: italic;
    }
    .detection .nodes {
      display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem;
    }
    .file-path {
      font-family: var(--font-mono); font-size: 0.7rem;
      background: var(--bg-input); color: var(--accent-text);
      padding: 2px 10px; border-radius: var(--radius-sm);
      font-weight: 500;
    }
    .doc-type-badge {
      font-size: 0.6rem; font-weight: 600;
      padding: 1px 6px; border-radius: 3px;
      background: var(--bg-input); color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .corpus-composition {
      font-size: 0.8rem; color: var(--text-muted); margin-top: 0.4rem;
    }
    .detection .nodes { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem; }
    .detection .action {
      margin-top: 0.6rem; padding: 0.5rem 0.75rem;
      background: var(--accent-muted); border-radius: var(--radius-sm);
      font-size: 0.8rem; color: var(--accent-text);
    }
    .action-label { font-weight: 700; }
    .detection .quote {
      margin-top: 0.5rem; padding: 0.5rem 0.75rem;
      background: var(--bg-input); border-radius: var(--radius-sm);
      font-size: 0.8rem; color: var(--text-secondary);
      font-style: italic; border-left: 2px solid var(--border-hover);
      font-family: var(--font-serif);
    }
    .section-label {
      font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.14em; color: var(--text-muted); margin-bottom: 0.75rem;
    }
    .exec-summary {
      background: var(--bg-card); border: 1px solid var(--border-default);
      border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem; box-shadow: var(--shadow-sm);
    }
    .exec-summary p { font-size: 0.9rem; line-height: 1.7; color: var(--text-secondary); }
    .exec-summary strong { color: var(--text-primary); }
    .toc {
      background: var(--bg-card); border: 1px solid var(--border-default);
      border-radius: var(--radius-lg); padding: 1rem 1.5rem;
      margin-bottom: 1.5rem; box-shadow: var(--shadow-sm);
    }
    .toc-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.5rem 0; border-bottom: 1px solid var(--border-default);
      text-decoration: none; color: var(--text-primary);
    }
    .toc-item:last-child { border-bottom: none; }
    .toc-label { font-weight: 600; font-size: 0.85rem; }
    .toc-meta { font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 0.5rem; align-items: center; }
    .toc-badge {
      font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
      background: var(--sev-critical); color: #fff;
      padding: 1px 6px; border-radius: var(--radius-sm);
    }
    .top-urgent {
      background: var(--bg-card); border: 1px solid var(--border-default);
      border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;
      margin-bottom: 2rem; box-shadow: var(--shadow-sm);
    }
    .urgent-item {
      display: flex; gap: 0.75rem; padding: 0.75rem 0;
      border-bottom: 1px solid var(--border-default);
    }
    .urgent-item:last-child { border-bottom: none; }
    .urgent-item.critical .urgent-num { background: var(--sev-critical); color: #fff; }
    .urgent-item.warning .urgent-num { background: var(--sev-warning); color: #fff; }
    .urgent-num {
      width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.7rem; font-weight: 700;
      background: var(--bg-input); color: var(--text-secondary);
    }
    .urgent-desc { font-size: 0.85rem; line-height: 1.5; margin-bottom: 0.35rem; }
    .urgent-files { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .type-section { margin-bottom: 2rem; }
    .type-header {
      font-family: var(--font-serif); font-size: 1.1rem; font-weight: 600;
      color: var(--text-primary); margin-bottom: 0.75rem;
      padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-default);
      display: flex; align-items: center; gap: 0.5rem;
    }
    .type-count {
      font-family: var(--font-sans); font-size: 0.7rem; font-weight: 700;
      background: var(--bg-input); color: var(--text-muted);
      padding: 2px 8px; border-radius: var(--radius-sm);
    }
    .next-steps {
      background: var(--bg-card); border: 1px solid var(--border-default);
      border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;
      margin-top: 2rem; box-shadow: var(--shadow-sm);
    }
    .step {
      display: flex; gap: 0.75rem; padding: 0.5rem 0;
      font-size: 0.85rem; line-height: 1.6; color: var(--text-secondary);
    }
    .step strong { color: var(--text-primary); }
    .step code {
      font-family: var(--font-mono); font-size: 0.75rem;
      background: var(--bg-input); padding: 1px 6px; border-radius: 3px;
    }
    .step-num {
      width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.65rem; font-weight: 700;
      background: var(--accent); color: #fff;
    }
    .empty {
      text-align: center; padding: 3rem 1rem;
      background: var(--bg-card); border: 1px solid var(--border-default);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
    }
    .empty h2 {
      font-family: var(--font-serif); font-size: 1.25rem;
      font-weight: 600; color: var(--color-success); margin-bottom: 0.25rem;
    }
    .empty p { color: var(--text-muted); font-size: 0.85rem; }
    .footer {
      text-align: center; margin-top: 2.5rem; padding-top: 1.25rem;
      border-top: 1px solid var(--border-default);
      color: var(--text-muted); font-size: 0.7rem;
    }
    .footer .brand-mark { color: var(--accent); font-weight: 700; }
    .context-quotes {
      margin-top: 0.65rem; display: flex; flex-direction: column; gap: 0.4rem;
    }
    .source-quote {
      padding: 0.5rem 0.75rem;
      background: #fdf6ee; border-left: 3px solid var(--accent);
      border-radius: var(--radius-sm); font-size: 0.8rem;
    }
    .source-quote-label {
      font-family: var(--font-mono); font-size: 0.7rem;
      color: var(--accent-text); font-weight: 600; display: block;
      margin-bottom: 0.15rem;
    }
    .source-quote-title {
      font-weight: 600; color: var(--text-primary); font-size: 0.8rem;
      display: block; margin-bottom: 0.2rem;
    }
    .source-quote-text {
      color: var(--text-secondary); font-style: italic;
      font-family: var(--font-serif); line-height: 1.5;
    }
    .source-quote-vs {
      text-align: center; font-size: 0.7rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--text-muted);
    }
    .confidence-indicator {
      font-size: 0.7rem; font-weight: 600;
      padding: 1px 7px; border-radius: var(--radius-sm);
      vertical-align: middle;
    }
    .confidence-indicator.confirmed { color: var(--sev-critical); background: var(--sev-critical-bg); }
    .confidence-indicator.likely { color: var(--sev-warning); background: var(--sev-warning-bg); }
    .confidence-indicator.review { color: var(--text-muted); background: var(--bg-input); }
    .score-annotation {
      text-align: center; font-size: 0.85rem; color: var(--text-secondary);
      margin-top: 0.4rem; margin-bottom: 0.5rem;
    }
    .score-critical { color: var(--sev-critical); font-weight: 700; }
    .score-warning { color: var(--sev-warning); font-weight: 700; }
    .share-snippet {
      background: var(--bg-card); border: 1px solid var(--border-default);
      border-radius: var(--radius-lg); padding: 1rem 1.5rem;
      margin-bottom: 1.5rem; box-shadow: var(--shadow-sm);
    }
    .share-text {
      font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;
      padding: 0.5rem 0.75rem; background: var(--bg-input);
      border-radius: var(--radius-sm); cursor: text; user-select: all;
    }
    .info-toggle {
      font-size: 0.8rem; color: var(--accent-text); cursor: pointer;
      padding: 0.5rem 0; font-weight: 600;
    }
    .footer-cta {
      font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);
      margin-bottom: 0.35rem;
    }
    .footer-cta code {
      font-family: var(--font-mono); font-size: 0.75rem;
      background: var(--bg-input); padding: 1px 6px; border-radius: 3px;
    }
    .footer-links {
      font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.35rem;
    }
    .footer-links a { color: var(--accent-text); text-decoration: underline; }
    .footer-gen { font-size: 0.7rem; color: var(--text-muted); }
    @media (max-width: 640px) {
      body { padding: 1.25rem 0.75rem; }
      .summary-type { width: 80px; font-size: 0.7rem; }
      .detection { padding: 0.75rem 1rem; }
      .report-header h1 { font-size: 1.4rem; }
      .type-header { font-size: 1rem; }
      .claims-grid { grid-template-columns: 1fr; }
      .claim-vs { text-align: center; padding: 0.25rem 0; }
    }
  `;
}
