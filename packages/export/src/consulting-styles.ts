/**
 * CSS for the Ody Refine consulting-grade health assessment report.
 * Warm parchment brand identity with consulting-grade typography and spacing.
 * Self-contained — no external resources. Animations in consulting-animations.ts.
 * @module consulting-styles
 */

import { getAnimationStyles } from './consulting-animations.js';

/** Complete CSS stylesheet for the consulting report. */
export function getConsultingStyles(): string {
  return getBaseStyles() + getAnimationStyles();
}

/** Core layout, typography, and component styles. */
function getBaseStyles(): string {
  return `
    :root {
      --bg-root: #f6f1e8; --bg-card: #fdfbf8; --bg-elevated: #fff;
      --bg-input: #f0ebe2; --bg-hover: #eae4d9;
      --accent: #bf5226; --accent-muted: rgba(191,82,38,0.08);
      --accent-hover: rgba(191,82,38,0.14); --accent-text: #9b3f1a;
      --text-primary: #17110c; --text-secondary: #5c4f42; --text-muted: #8a7e72;
      --border: rgba(20,15,10,0.08); --border-hover: rgba(20,15,10,0.14);
      --sev-critical: #c03030; --sev-critical-bg: rgba(192,48,48,0.06);
      --sev-warning: #b8860b; --sev-warning-bg: rgba(184,134,11,0.06);
      --sev-info: #5c4f42; --sev-info-bg: rgba(92,79,66,0.04);
      --color-success: #2d8a54; --color-success-bg: rgba(45,138,84,0.06);
      --effort-quick: #2d8a54; --effort-medium: #b8860b; --effort-major: #c03030;
      --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
      --font-sans: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-serif: 'Newsreader', Georgia, 'Times New Roman', serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--font-sans);background:var(--bg-root);color:var(--text-primary);
      line-height:1.7;max-width:860px;margin:0 auto;padding:2.5rem 1.5rem;
      -webkit-font-smoothing:antialiased;letter-spacing:-0.01em}
    a{color:var(--accent-text);text-decoration:underline}
    .cover{text-align:center;padding:3rem 0 1.5rem}
    .cover-brand{display:inline-flex;align-items:center;gap:0.5rem;font-size:0.65rem;
      font-weight:700;text-transform:uppercase;letter-spacing:0.18em;
      color:var(--accent);margin-bottom:1rem}
    .cover-dot{width:7px;height:7px;background:var(--accent);border-radius:50%}
    .cover h1{font-family:var(--font-serif);font-size:2rem;font-weight:600;
      letter-spacing:-0.03em;color:var(--text-primary);margin-bottom:0.4rem}
    .cover-sub{font-family:var(--font-serif);font-size:1rem;font-weight:400;
      color:var(--text-secondary);margin-bottom:0.4rem;font-style:italic}
    .cover-meta{font-size:0.82rem;color:var(--text-muted)}
    .section{margin-top:3.5rem}
    .section-label{font-size:0.6rem;font-weight:700;text-transform:uppercase;
      letter-spacing:0.14em;color:var(--text-muted);margin-bottom:0.75rem;
      padding-bottom:0.5rem;border-bottom:1px solid var(--border)}
    .score-hero{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;
      gap:2.5rem;background:var(--bg-card);border:1px solid var(--border);
      border-radius:var(--radius-lg);padding:2rem;box-shadow:var(--shadow-sm)}
    .score-main{text-align:center;position:relative}
    .score-main .score-label{font-size:0.65rem;font-weight:700;text-transform:uppercase;
      letter-spacing:0.12em;color:var(--text-muted);margin-top:0.25rem}
    .score-main .score-grade{font-family:var(--font-serif);font-size:1.3rem;
      font-weight:800;letter-spacing:-0.02em;margin-top:-0.15rem}
    .score-main svg text{font-family:var(--font-sans)}
    .radar-wrap{flex:1;min-width:240px;max-width:340px}
    .radar-wrap svg text{font-family:var(--font-sans)}
    .exec-card{background:var(--bg-card);border:1px solid var(--border);
      border-radius:var(--radius-lg);padding:1.5rem 1.75rem;box-shadow:var(--shadow-sm)}
    .exec-card .ghost-slide{font-family:var(--font-serif);font-size:1.15rem;
      line-height:1.65;color:var(--text-primary);font-weight:600;margin-bottom:0.25rem}
    .exec-card .exec-context{font-size:0.88rem;line-height:1.7;color:var(--text-secondary)}
    .exec-card strong{color:var(--text-primary)}
    .exec-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));
      gap:1rem;margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--border)}
    .exec-stat{text-align:center}
    .exec-stat-value{font-size:1.5rem;font-weight:800;color:var(--text-primary);
      font-family:var(--font-mono);line-height:1}
    .exec-stat-label{font-size:0.6rem;font-weight:600;text-transform:uppercase;
      letter-spacing:0.1em;color:var(--text-muted);margin-top:0.25rem}
    .category-group{margin-bottom:2.5rem}
    .category-header{font-family:var(--font-serif);font-size:1.15rem;font-weight:600;
      color:var(--text-primary);display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem}
    .category-icon{font-style:normal;font-size:1rem}
    .category-count{font-family:var(--font-sans);font-size:0.6rem;font-weight:700;
      background:var(--bg-input);color:var(--text-muted);padding:2px 8px;border-radius:var(--radius-sm)}
    .category-intro{font-size:0.85rem;color:var(--text-secondary);line-height:1.65;
      margin-bottom:1rem;font-style:italic}
    .findings-list{display:flex;flex-direction:column;gap:0.75rem}
    .finding{background:var(--bg-card);border:1px solid var(--border);
      border-radius:var(--radius-md);padding:1.25rem 1.5rem;
      border-left:3px solid var(--text-muted);box-shadow:var(--shadow-sm)}
    .finding.critical{border-left:4px solid var(--sev-critical);background:var(--sev-critical-bg)}
    .finding.warning{border-left:4px solid var(--sev-warning);background:var(--sev-warning-bg)}
    .finding.info{border-left:2px solid var(--border-hover);background:var(--sev-info-bg)}
    .finding-header{display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem}
    .sev-badge{display:inline-block;font-size:0.55rem;font-weight:700;text-transform:uppercase;
      letter-spacing:0.06em;padding:2px 8px;border-radius:var(--radius-sm);color:#fff}
    .sev-badge.critical{background:var(--sev-critical)}
    .sev-badge.warning{background:var(--sev-warning)}
    .sev-badge.info{background:var(--sev-info)}
    .finding-headline{font-weight:700;font-size:0.92rem;color:var(--text-primary)}
    .effort-badge{font-size:0.6rem;font-weight:600;padding:2px 8px;border-radius:var(--radius-sm)}
    .evidence-pair{display:grid;grid-template-columns:1fr auto 1fr;gap:0.5rem;
      align-items:stretch;margin:0.75rem 0}
    .evidence-block{padding:0.75rem;border-radius:var(--radius-sm);
      background:var(--bg-elevated);border:1px solid var(--border);font-size:0.82rem}
    .evidence-source{font-family:var(--font-mono);font-size:0.65rem;font-weight:600;
      color:var(--accent-text);margin-bottom:0.25rem;display:block}
    .evidence-text{color:var(--text-secondary);font-style:italic;
      font-family:var(--font-serif);line-height:1.6}
    .evidence-vs{display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:0.65rem;color:var(--text-muted);
      text-transform:uppercase;letter-spacing:0.1em}
    .evidence-single{padding:0.6rem 0.75rem;border-radius:var(--radius-sm);
      background:var(--bg-elevated);border:1px solid var(--border);
      border-left:3px solid var(--accent);font-size:0.82rem;margin:0.5rem 0}
    .finding-impact{font-size:0.82rem;color:var(--text-secondary);margin-top:0.5rem;
      padding-left:0.75rem;border-left:2px solid var(--sev-warning);font-style:italic}
    .finding-recommendation{margin-top:0.5rem;padding:0.5rem 0.75rem;
      background:var(--accent-muted);border-radius:var(--radius-sm);
      font-size:0.82rem;color:var(--accent-text)}
    .finding-docs{display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.4rem}
    .doc-tag{font-family:var(--font-mono);font-size:0.65rem;font-weight:500;
      background:var(--bg-input);color:var(--accent-text);padding:2px 8px;
      border-radius:var(--radius-sm)}
    .action-list{display:flex;flex-direction:column;gap:0.75rem}
    .action-item{display:flex;gap:1rem;padding:1rem 1.25rem;background:var(--bg-card);
      border:1px solid var(--border);border-radius:var(--radius-md);box-shadow:var(--shadow-sm)}
    .action-num{width:28px;height:28px;border-radius:50%;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;
      font-size:0.65rem;font-weight:800;color:#fff}
    .action-num.quick_win{background:var(--effort-quick)}
    .action-num.medium{background:var(--effort-medium)}
    .action-num.major{background:var(--effort-major)}
    .action-body{flex:1}
    .action-title{font-weight:700;font-size:0.88rem;color:var(--text-primary);margin-bottom:0.15rem}
    .action-detail{font-size:0.82rem;color:var(--text-secondary);line-height:1.6}
    .methodology{background:var(--bg-card);border:1px solid var(--border);
      border-radius:var(--radius-lg);padding:1.25rem 1.5rem;box-shadow:var(--shadow-sm);
      font-size:0.82rem;color:var(--text-secondary);line-height:1.7}
    .methodology strong{color:var(--text-primary)}
    .report-footer{text-align:center;margin-top:3.5rem;padding-top:1.5rem;
      border-top:1px solid var(--border)}
    .footer-cta{font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.35rem}
    .footer-cta code{font-family:var(--font-mono);font-size:0.75rem;
      background:var(--bg-input);padding:1px 6px;border-radius:3px}
    .footer-links{font-size:0.7rem;color:var(--text-muted);margin-bottom:0.35rem}
    .footer-links a{color:var(--accent-text)}
    .footer-gen{font-size:0.65rem;color:var(--text-muted)}
    .footer-brand{color:var(--accent);font-weight:700}
    .score-trajectory{display:flex;align-items:center;justify-content:center;
      gap:0.5rem;margin-top:0.75rem;font-size:0.82rem}
    .trajectory-current{font-family:var(--font-mono);font-weight:800;color:var(--sev-critical)}
    .trajectory-arrow{color:var(--text-muted);font-size:1.1rem}
    .trajectory-projected{font-family:var(--font-mono);font-weight:800;color:var(--color-success)}
    .trajectory-label{color:var(--text-muted);font-size:0.72rem}
    @media(prefers-color-scheme:dark){
      :root{
        --bg-root:#141210;--bg-card:#1c1a17;--bg-elevated:#242220;
        --bg-input:#2a2723;--bg-hover:#33302b;
        --accent:#e0764a;--accent-muted:rgba(224,118,74,0.1);
        --accent-hover:rgba(224,118,74,0.18);--accent-text:#e89a73;
        --text-primary:#ece6dd;--text-secondary:#a89e92;--text-muted:#706860;
        --border:rgba(255,245,230,0.08);--border-hover:rgba(255,245,230,0.14);
        --sev-critical:#e05050;--sev-critical-bg:rgba(224,80,80,0.1);
        --sev-warning:#d4a020;--sev-warning-bg:rgba(212,160,32,0.1);
        --sev-info:#a89e92;--sev-info-bg:rgba(168,158,146,0.06);
        --color-success:#3daa6a;--color-success-bg:rgba(61,170,106,0.1);
        --shadow-sm:0 1px 3px rgba(0,0,0,0.3),0 1px 2px rgba(0,0,0,0.2);
        --shadow-md:0 4px 12px rgba(0,0,0,0.4);
      }
      .sev-badge.critical{background:#c03030}
      .sev-badge.warning{background:#b8860b}
      .share-btn.twitter{background:#1a8cd8}
      .share-btn.linkedin{background:#095dab}
    }
    @page{margin:1.5cm 2cm}
    @media print{
      body{background:#fff;padding:0;max-width:100%;color:#17110c}
      .cover{background:none;page-break-after:avoid}
      .cover h1{color:#17110c}
      .cover-brand{color:#bf5226}
      .section{page-break-inside:avoid;page-break-before:auto}
      .section:nth-child(n+3){page-break-before:always}
      .finding,.exec-card,.methodology,.action-item{box-shadow:none;break-inside:avoid}
      .sev-badge,.action-num,.heatmap-dot,.cover-dot{
        -webkit-print-color-adjust:exact;print-color-adjust:exact}
      .score-hero{box-shadow:none;border-color:#ddd}
      a{color:#9b3f1a}
      a::after{content:' (' attr(href) ')';font-size:0.65rem;color:#8a7e72}
      .share-section{display:none}
    }
    @media(max-width:640px){
      body{padding:1.25rem 0.75rem}
      .cover h1{font-size:1.5rem}
      .score-hero{flex-direction:column;align-items:center;gap:1.5rem;padding:1.5rem 1rem}
      .radar-wrap{min-width:200px}
      .evidence-pair{grid-template-columns:1fr}
      .evidence-vs{padding:0.25rem 0}
      .exec-stats{grid-template-columns:repeat(2,1fr)}
      .section{margin-top:2.5rem}
      .score-main svg{width:160px;height:160px}
      .exec-card .ghost-slide{font-size:1rem}
      .share-btn{width:100%;max-width:280px;justify-content:center}
    }
  `;
}
