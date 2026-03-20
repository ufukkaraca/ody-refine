// EXCEEDS_LIMIT: CSS template string (consulting-grade report styles)
/**
 * CSS styles for the Ody Refine consulting-grade health report.
 * Professional McKinsey-inspired design: deep navy palette, clean typography, print-ready.
 * Self-contained — no external resources.
 * @module html-styles
 */

/** Complete CSS stylesheet for the consulting-grade health report. */
export function getReportStyles(): string {
  return `
    :root {
      --navy-900: #0A1628; --navy-800: #0F2038; --navy-700: #1A3358;
      --navy-600: #1E3A5F; --navy-500: #2D5F8A;
      --blue-600: #2563EB; --blue-500: #3B82F6; --blue-100: #DBEAFE;
      --red-600: #DC2626; --red-500: #EF4444; --red-50: #FEF2F2;
      --amber-600: #D97706; --amber-500: #F59E0B; --amber-50: #FFFBEB;
      --green-600: #059669; --green-500: #10B981; --green-50: #ECFDF5;
      --slate-900: #0F172A; --slate-800: #1E293B; --slate-700: #334155;
      --slate-600: #475569; --slate-500: #64748B; --slate-400: #94A3B8;
      --slate-300: #CBD5E1; --slate-200: #E2E8F0; --slate-100: #F1F5F9;
      --slate-50: #F8FAFC; --white: #FFFFFF;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
      --font-serif: Georgia, 'Times New Roman', serif;
      --font-mono: 'SF Mono', 'Fira Code', Consolas, monospace;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
      --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.05);
      --radius: 8px; --radius-lg: 12px;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--font-sans);background:var(--slate-50);color:var(--slate-900);
      line-height:1.65;max-width:860px;margin:0 auto;padding:0;
      -webkit-font-smoothing:antialiased;letter-spacing:-0.01em}
    a{color:var(--blue-600);text-decoration:none}
    a:hover{text-decoration:underline}
    /* === Cover === */
    .report-cover{background:linear-gradient(135deg,var(--navy-900) 0%,var(--navy-700) 100%);
      color:var(--white);padding:2.5rem 2.5rem 2rem;position:relative;overflow:hidden}
    .report-cover::after{content:'';position:absolute;top:0;right:0;width:300px;height:300px;
      background:radial-gradient(circle,rgba(59,130,246,0.12) 0%,transparent 70%);pointer-events:none}
    .cover-brand{display:inline-flex;align-items:center;gap:0.5rem;font-size:0.65rem;
      font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:var(--blue-500);
      margin-bottom:1rem}
    .cover-brand-dot{width:8px;height:8px;background:var(--blue-500);border-radius:50%}
    .report-cover h1{font-family:var(--font-serif);font-size:2rem;font-weight:700;
      letter-spacing:-0.03em;line-height:1.2;margin-bottom:0.5rem}
    .cover-meta{font-size:0.85rem;color:var(--slate-400);font-weight:400}
    /* === Score Hero === */
    .score-hero{background:var(--white);border:1px solid var(--slate-200);
      margin:1.5rem 1.5rem 0;border-radius:var(--radius-lg);padding:2rem;
      box-shadow:var(--shadow-md);text-align:center}
    .score-display{margin-bottom:0.75rem}
    .score-ring text{font-family:var(--font-sans)}
    .score-annotation{font-size:0.85rem;color:var(--slate-600);margin-bottom:1.5rem}
    .score-critical{color:var(--red-600);font-weight:700}
    .score-warning{color:var(--amber-600);font-weight:700}
    /* === Dimensions === */
    .dim-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1rem;
      margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--slate-200)}
    .dim-card{text-align:left}
    .dim-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.4rem}
    .dim-label{font-size:0.7rem;font-weight:600;text-transform:uppercase;
      letter-spacing:0.1em;color:var(--slate-500)}
    .dim-value{font-size:0.8rem;font-weight:800;color:var(--slate-900);font-family:var(--font-mono)}
    .dim-bar-track{height:6px;background:var(--slate-100);border-radius:3px;overflow:hidden}
    .dim-bar-fill{height:100%;border-radius:3px;transition:width 0.3s}
    .dim-fill-good{background:var(--green-500)}
    .dim-fill-warn{background:var(--amber-500)}
    .dim-fill-bad{background:var(--red-500)}
    /* === Sections === */
    .report-body{padding:0 1.5rem 1.5rem}
    .report-section{margin-top:2rem}
    .section-header{display:flex;align-items:baseline;gap:0.75rem;
      margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:2px solid var(--navy-900)}
    .section-num{font-family:var(--font-mono);font-size:0.7rem;font-weight:700;
      color:var(--blue-600);letter-spacing:0.05em}
    .section-header h2{font-family:var(--font-serif);font-size:1.3rem;font-weight:700;
      color:var(--navy-900);letter-spacing:-0.02em}
    /* === Executive Summary === */
    .exec-card{background:var(--white);border:1px solid var(--slate-200);
      border-radius:var(--radius-lg);padding:1.5rem;box-shadow:var(--shadow-sm)}
    .exec-card p{font-size:0.9rem;line-height:1.75;color:var(--slate-700)}
    .exec-card strong{color:var(--slate-900)}
    .exec-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
      gap:1rem;margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--slate-100)}
    .exec-stat{text-align:center}
    .exec-stat-value{font-size:1.5rem;font-weight:800;color:var(--navy-900);
      font-family:var(--font-mono);line-height:1}
    .exec-stat-label{font-size:0.65rem;font-weight:600;text-transform:uppercase;
      letter-spacing:0.1em;color:var(--slate-400);margin-top:0.25rem}
    /* === Table of Contents === */
    .toc{background:var(--white);border:1px solid var(--slate-200);
      border-radius:var(--radius-lg);padding:1rem 1.25rem;box-shadow:var(--shadow-sm)}
    .toc-item{display:flex;justify-content:space-between;align-items:center;
      padding:0.6rem 0;border-bottom:1px solid var(--slate-100);
      text-decoration:none;color:var(--slate-900)}
    .toc-item:last-child{border-bottom:none}
    .toc-item:hover{color:var(--blue-600)}
    .toc-label{font-weight:600;font-size:0.85rem}
    .toc-meta{display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;color:var(--slate-500)}
    .toc-badge{font-size:0.6rem;font-weight:700;text-transform:uppercase;
      background:var(--red-600);color:var(--white);padding:2px 7px;border-radius:4px}
    /* === Findings === */
    .findings{display:flex;flex-direction:column;gap:0.75rem}
    .finding{background:var(--white);border:1px solid var(--slate-200);
      border-radius:var(--radius);padding:1.25rem 1.5rem;
      border-left:4px solid var(--slate-300);box-shadow:var(--shadow-sm)}
    .finding.critical{border-left-color:var(--red-600);background:var(--red-50)}
    .finding.warning{border-left-color:var(--amber-600);background:var(--amber-50)}
    .finding.info{border-left-color:var(--slate-400);background:var(--slate-50)}
    .finding-header{display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;flex-wrap:wrap}
    .sev-badge{display:inline-block;font-size:0.6rem;font-weight:700;text-transform:uppercase;
      letter-spacing:0.06em;padding:2px 8px;border-radius:4px;color:var(--white)}
    .sev-badge.critical{background:var(--red-600)}
    .sev-badge.warning{background:var(--amber-600)}
    .sev-badge.info{background:var(--slate-500)}
    .confidence-badge{font-size:0.65rem;font-weight:600;padding:1px 7px;border-radius:4px}
    .confidence-badge.confirmed{color:var(--red-600);background:rgba(220,38,38,0.08)}
    .confidence-badge.likely{color:var(--amber-600);background:rgba(217,119,6,0.08)}
    .confidence-badge.review{color:var(--slate-500);background:var(--slate-100)}
    .finding-headline{font-weight:700;font-size:0.95rem;color:var(--slate-900)}
    .finding-files{display:flex;flex-wrap:wrap;gap:0.3rem;margin:0.4rem 0}
    .file-tag{font-family:var(--font-mono);font-size:0.65rem;font-weight:500;
      background:var(--slate-100);color:var(--navy-600);padding:2px 8px;border-radius:4px}
    .doc-type-tag{font-size:0.6rem;font-weight:600;padding:1px 6px;border-radius:3px;
      background:var(--blue-100);color:var(--blue-600);text-transform:uppercase;letter-spacing:0.04em}
    /* === Evidence Comparison === */
    .evidence-grid{display:grid;grid-template-columns:1fr auto 1fr;gap:0.5rem;
      align-items:stretch;margin:0.75rem 0}
    .evidence-block{padding:0.75rem;border-radius:var(--radius);background:var(--white);
      border:1px solid var(--slate-200);font-size:0.82rem}
    .evidence-block-a{border-left:3px solid var(--amber-500)}
    .evidence-block-b{border-left:3px solid var(--navy-500)}
    .evidence-source{font-family:var(--font-mono);font-size:0.65rem;font-weight:600;
      color:var(--blue-600);margin-bottom:0.25rem;display:block}
    .evidence-source a{color:var(--blue-600)}
    .evidence-text{color:var(--slate-700);font-style:italic;line-height:1.5}
    .evidence-vs{display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:0.7rem;color:var(--slate-400);text-transform:uppercase;
      letter-spacing:0.1em}
    /* === Impact & Action === */
    .finding-impact{font-size:0.82rem;color:var(--slate-600);margin-top:0.5rem;
      padding-left:0.75rem;border-left:2px solid var(--amber-500);font-style:italic}
    .finding-action{margin-top:0.5rem;padding:0.5rem 0.75rem;
      background:rgba(37,99,235,0.04);border-radius:var(--radius);
      font-size:0.82rem;color:var(--navy-600)}
    .finding-action strong{font-weight:700}
    /* === Effort Badges === */
    .effort-badge{font-size:0.6rem;font-weight:600;padding:2px 8px;border-radius:4px;
      vertical-align:middle;white-space:nowrap}
    /* === Summary Bars === */
    .summary-section{background:var(--white);border:1px solid var(--slate-200);
      border-radius:var(--radius-lg);padding:1.25rem 1.5rem;box-shadow:var(--shadow-sm)}
    .summary-title{font-size:0.65rem;font-weight:700;text-transform:uppercase;
      letter-spacing:0.12em;color:var(--slate-400);margin-bottom:0.75rem}
    .summary-row{display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem}
    .summary-row:last-child{margin-bottom:0}
    .summary-type{width:110px;font-size:0.8rem;font-weight:600;color:var(--slate-700);text-transform:capitalize}
    .summary-bar-track{flex:1;height:6px;background:var(--slate-100);border-radius:3px;overflow:hidden}
    .summary-bar-fill{height:100%;border-radius:3px;background:var(--navy-600)}
    .summary-count{font-size:0.8rem;font-weight:700;color:var(--slate-900);
      font-family:var(--font-mono);min-width:24px;text-align:right}
    /* === Contradiction Map === */
    .map-container{background:var(--white);border:1px solid var(--slate-200);
      border-radius:var(--radius-lg);padding:1.5rem;box-shadow:var(--shadow-sm);text-align:center}
    .map-container svg{max-width:100%}
    .map-legend{display:flex;justify-content:center;gap:1.5rem;margin-top:1rem;
      font-size:0.7rem;color:var(--slate-500)}
    .map-legend-item{display:flex;align-items:center;gap:0.35rem}
    .map-legend-dot{width:8px;height:8px;border-radius:50%}
    /* === Risk Register === */
    .risk-table{width:100%;border-collapse:collapse;background:var(--white);
      border:1px solid var(--slate-200);border-radius:var(--radius-lg);
      overflow:hidden;box-shadow:var(--shadow-sm)}
    .risk-table th{background:var(--navy-900);color:var(--white);font-size:0.7rem;
      font-weight:600;text-transform:uppercase;letter-spacing:0.08em;
      padding:0.75rem 1rem;text-align:left}
    .risk-table td{padding:0.75rem 1rem;font-size:0.82rem;color:var(--slate-700);
      border-bottom:1px solid var(--slate-100)}
    .risk-table tr:last-child td{border-bottom:none}
    .risk-table tr:hover td{background:var(--slate-50)}
    .risk-score{display:inline-block;font-weight:700;font-family:var(--font-mono);
      font-size:0.75rem;padding:2px 8px;border-radius:4px}
    .risk-score.high{background:var(--red-50);color:var(--red-600)}
    .risk-score.medium{background:var(--amber-50);color:var(--amber-600)}
    .risk-score.low{background:var(--slate-100);color:var(--slate-600)}
    /* === Action Plan === */
    .action-list{display:flex;flex-direction:column;gap:0.75rem}
    .action-item{display:flex;gap:1rem;padding:1rem 1.25rem;background:var(--white);
      border:1px solid var(--slate-200);border-radius:var(--radius);box-shadow:var(--shadow-sm)}
    .action-priority{width:32px;height:32px;border-radius:50%;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;
      font-size:0.65rem;font-weight:800;font-family:var(--font-mono)}
    .action-priority.p1{background:var(--red-600);color:var(--white)}
    .action-priority.p2{background:var(--amber-600);color:var(--white)}
    .action-priority.p3{background:var(--blue-600);color:var(--white)}
    .action-priority.p4{background:var(--slate-500);color:var(--white)}
    .action-title{font-weight:700;font-size:0.9rem;color:var(--slate-900);margin-bottom:0.2rem}
    .action-detail{font-size:0.82rem;color:var(--slate-600);line-height:1.6}
    .action-detail code{font-family:var(--font-mono);font-size:0.75rem;
      background:var(--slate-100);padding:1px 5px;border-radius:3px}
    /* === Type Sections === */
    .type-section{margin-bottom:1.5rem}
    .type-header{font-family:var(--font-serif);font-size:1.1rem;font-weight:600;
      color:var(--slate-900);margin-bottom:0.75rem;padding-bottom:0.5rem;
      border-bottom:1px solid var(--slate-200);display:flex;align-items:center;gap:0.5rem}
    .type-count{font-family:var(--font-sans);font-size:0.65rem;font-weight:700;
      background:var(--slate-100);color:var(--slate-500);padding:2px 8px;border-radius:4px}
    /* === Stats === */
    .stats-line{text-align:center;font-size:0.75rem;color:var(--slate-400);
      font-family:var(--font-mono);margin:1rem 0}
    /* === Empty State === */
    .empty-state{text-align:center;padding:3rem 1.5rem;background:var(--white);
      border:1px solid var(--slate-200);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)}
    .empty-state h2{font-family:var(--font-serif);font-size:1.3rem;font-weight:600;
      color:var(--green-600);margin-bottom:0.25rem}
    .empty-state p{color:var(--slate-500);font-size:0.85rem}
    /* === Info Toggle === */
    .info-toggle{font-size:0.8rem;color:var(--blue-600);cursor:pointer;padding:0.5rem 0;font-weight:600}
    /* === Footer === */
    .report-footer{text-align:center;margin:2.5rem 1.5rem 1.5rem;padding-top:1.5rem;
      border-top:2px solid var(--navy-900)}
    .footer-cta{font-size:0.85rem;font-weight:600;color:var(--slate-700);margin-bottom:0.35rem}
    .footer-cta code{font-family:var(--font-mono);font-size:0.8rem;
      background:var(--slate-100);padding:2px 8px;border-radius:4px}
    .footer-links{font-size:0.75rem;color:var(--slate-500);margin-bottom:0.35rem}
    .footer-links a{color:var(--blue-600)}
    .footer-gen{font-size:0.7rem;color:var(--slate-400)}
    .footer-brand{color:var(--navy-900);font-weight:700}
    /* === Print === */
    @page{margin:1.5cm 2cm}
    @media print{
      body{background:#fff;padding:0;max-width:100%}
      .report-cover{background:var(--navy-900)!important;-webkit-print-color-adjust:exact;
        print-color-adjust:exact}
      .finding,.exec-card,.map-container,.action-item,.risk-table{
        box-shadow:none;break-inside:avoid}
      .report-section{break-inside:avoid}
      .sev-badge,.action-priority{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .info-toggle{display:none}
      a[href]::after{content:' (' attr(href) ')';font-size:0.7rem;color:var(--slate-400)}
    }
    /* === Responsive === */
    @media(max-width:640px){
      .report-cover{padding:1.5rem}
      .report-cover h1{font-size:1.5rem}
      .score-hero{margin:1rem 0.75rem 0;padding:1.5rem 1rem}
      .report-body{padding:0 0.75rem 1rem}
      .dim-grid{grid-template-columns:1fr 1fr}
      .evidence-grid{grid-template-columns:1fr}
      .evidence-vs{padding:0.25rem 0}
      .exec-stats{grid-template-columns:repeat(2,1fr)}
      .summary-type{width:80px;font-size:0.7rem}
      .section-header h2{font-size:1.1rem}
      .report-footer{margin:2rem 0.75rem 1rem}
    }
  `;
}
