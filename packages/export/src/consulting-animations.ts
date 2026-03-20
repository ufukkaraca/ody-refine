/**
 * CSS animations and enhanced component styles for the consulting report.
 * Score ring animation, finding slide-ins, severity pulse, radar draw.
 * CSS-only — no JavaScript dependencies.
 * @module consulting-animations
 */

/** Keyframe animations and enhanced interactive styles. */
export function getAnimationStyles(): string {
  return `
    /* === Keyframe Animations === */
    @keyframes score-fill {
      from { stroke-dashoffset: 339.3; }
    }
    @keyframes score-number {
      from { opacity: 0; transform: scale(0.5); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes radar-draw {
      from { stroke-dashoffset: 800; opacity: 0; }
      to { stroke-dashoffset: 0; opacity: 1; }
    }
    @keyframes radar-fill {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fade-up {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse-critical {
      0%, 100% { box-shadow: 0 0 0 0 rgba(192,48,48,0.15); }
      50% { box-shadow: 0 0 0 4px rgba(192,48,48,0.08); }
    }
    @keyframes verdict-line {
      from { width: 0; }
      to { width: 100%; }
    }
    @keyframes heatmap-pop {
      from { opacity: 0; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1); }
    }

    /* === Score Ring Animation + Glow === */
    .score-arc-animated {
      animation: score-fill 1.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      filter: drop-shadow(0 0 6px var(--glow-color, rgba(191,82,38,0.2)));
    }
    .score-number-animated {
      animation: score-number 0.6s 0.8s cubic-bezier(0.2, 0, 0.2, 1) both;
    }

    /* === Radar Animation === */
    .radar-polygon {
      stroke-dasharray: 800;
      animation: radar-draw 1.2s 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    .radar-fill-area {
      animation: radar-fill 0.8s 1.2s ease-out both;
      opacity: 0;
    }
    .radar-dot { opacity: 0; animation: radar-fill 0.3s ease-out both; }
    .radar-dot:nth-child(1) { animation-delay: 1.4s; }
    .radar-dot:nth-child(2) { animation-delay: 1.5s; }
    .radar-dot:nth-child(3) { animation-delay: 1.6s; }
    .radar-dot:nth-child(4) { animation-delay: 1.7s; }

    /* === Finding Animations === */
    .finding { opacity: 0; animation: fade-up 0.5s ease-out forwards; }
    .finding:nth-child(1) { animation-delay: 0.1s; }
    .finding:nth-child(2) { animation-delay: 0.2s; }
    .finding:nth-child(3) { animation-delay: 0.3s; }
    .finding:nth-child(4) { animation-delay: 0.4s; }
    .finding:nth-child(5) { animation-delay: 0.5s; }
    .finding:nth-child(6) { animation-delay: 0.6s; }
    .finding:nth-child(7) { animation-delay: 0.7s; }
    .finding:nth-child(8) { animation-delay: 0.8s; }
    .finding.critical .sev-badge { animation: pulse-critical 2.5s ease-in-out infinite; }
    .action-item { opacity: 0; animation: fade-up 0.4s ease-out forwards; }
    .action-item:nth-child(1) { animation-delay: 0.1s; }
    .action-item:nth-child(2) { animation-delay: 0.15s; }
    .action-item:nth-child(3) { animation-delay: 0.2s; }
    .action-item:nth-child(4) { animation-delay: 0.25s; }
    .action-item:nth-child(5) { animation-delay: 0.3s; }
    .action-item:nth-child(6) { animation-delay: 0.35s; }
    .exec-card { opacity: 0; animation: fade-up 0.6s 0.2s ease-out forwards; }

    /* === Verdict Line === */
    .verdict-line {
      height: 2px; background: var(--sev-critical);
      margin: 0.5rem 0 0.75rem; border-radius: 1px;
      animation: verdict-line 0.8s 0.4s ease-out forwards; width: 0;
    }
    .verdict-line.healthy { background: var(--color-success); }

    /* === Evidence Enhancement === */
    .evidence-block .evidence-label {
      font-size: 0.55rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; margin-bottom: 0.35rem; display: block;
    }
    .evidence-block.claim-a { border-left: 3px solid var(--sev-critical); }
    .evidence-block.claim-a .evidence-label { color: var(--sev-critical); }
    .evidence-block.claim-b { border-left: 3px solid var(--accent); }
    .evidence-block.claim-b .evidence-label { color: var(--accent); }
    .evidence-text strong { color: var(--text-primary); font-weight: 700;
      background: rgba(191,82,38,0.08); padding: 0 2px; border-radius: 2px; }
    .why-it-matters {
      margin-top: 0.75rem; padding: 0.6rem 0.85rem;
      background: var(--sev-critical-bg); border-radius: var(--radius-sm);
      font-size: 0.82rem; line-height: 1.6; color: var(--text-secondary);
      border-left: 3px solid var(--sev-critical);
    }
    .why-it-matters.warning-impact { background: var(--sev-warning-bg);
      border-left-color: var(--sev-warning); }
    .why-it-matters.info-impact { background: var(--sev-info-bg);
      border-left-color: var(--sev-info); }
    .why-it-matters strong { color: var(--text-primary);
      font-family: var(--font-serif); }

    /* === Heatmap Coverage === */
    .heatmap-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.5rem; margin-bottom: 1rem;
    }
    .heatmap-cell {
      padding: 0.6rem 0.75rem; border-radius: var(--radius-sm);
      border: 1px solid var(--border); position: relative;
      animation: heatmap-pop 0.3s ease-out both;
    }
    .heatmap-cell:nth-child(n) { animation-delay: calc(var(--i, 0) * 60ms); }
    .heatmap-topic { font-size: 0.75rem; font-weight: 700; color: var(--text-primary);
      margin-bottom: 0.15rem; }
    .heatmap-count { font-size: 0.6rem; color: var(--text-muted);
      font-family: var(--font-mono); }
    .heatmap-cell.healthy { background: rgba(45,138,84,0.06);
      border-color: rgba(45,138,84,0.15); }
    .heatmap-cell.conflicted { background: rgba(192,48,48,0.06);
      border-color: rgba(192,48,48,0.15); }
    .heatmap-cell.thin { background: transparent;
      border: 1px dashed var(--sev-warning); }
    .heatmap-dot { width: 6px; height: 6px; border-radius: 50%;
      position: absolute; top: 0.5rem; right: 0.5rem; }
    .heatmap-dot.green { background: var(--color-success); }
    .heatmap-dot.red { background: var(--sev-critical); }
    .heatmap-dot.amber { background: var(--sev-warning); }

    /* === Action Plan Enhancement === */
    .action-item { transition: transform 0.15s ease; }
    .action-item:hover { transform: translateX(3px); }
    .action-group-label { font-size: 0.6rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--text-muted); margin: 1rem 0 0.5rem;
      padding-bottom: 0.35rem; border-bottom: 1px solid var(--border); }
    .action-group-label:first-child { margin-top: 0; }
    .action-ref { font-family: var(--font-mono); font-size: 0.6rem;
      color: var(--text-muted); margin-top: 0.15rem; }
    .roi-banner {
      margin-top: 1rem; padding: 0.75rem 1rem;
      background: var(--color-success-bg); border: 1px solid rgba(45,138,84,0.15);
      border-radius: var(--radius-md); text-align: center;
    }
    .roi-banner strong { color: var(--color-success);
      font-family: var(--font-mono); font-size: 1.1rem; }
    .roi-banner p { font-size: 0.82rem; color: var(--text-secondary);
      margin-top: 0.15rem; }

    /* === Share Section === */
    .share-section {
      margin-top: 2.5rem; padding: 1.5rem; text-align: center;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
    }
    .share-title { font-family: var(--font-serif); font-size: 1.05rem;
      font-weight: 600; margin-bottom: 0.75rem; }
    .share-buttons { display: flex; gap: 0.5rem; justify-content: center;
      flex-wrap: wrap; margin-bottom: 1rem; }
    .share-btn { display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.4rem 1rem; font-size: 0.78rem; font-weight: 600;
      border-radius: var(--radius-sm); text-decoration: none; color: #fff;
      transition: opacity 0.15s; }
    .share-btn:hover { opacity: 0.85; }
    .share-btn.twitter { background: #1d9bf0; color: #fff; }
    .share-btn.linkedin { background: #0a66c2; color: #fff; }
    .share-btn.copy { background: var(--bg-input); color: var(--text-primary);
      border: 1px solid var(--border); cursor: pointer; font-family: inherit; }
    .badge-section { margin-top: 1rem; padding-top: 1rem;
      border-top: 1px solid var(--border); }
    .badge-section p { font-size: 0.72rem; color: var(--text-muted);
      margin-bottom: 0.5rem; }
    .badge-code { font-family: var(--font-mono); font-size: 0.65rem;
      background: var(--bg-input); padding: 0.5rem 0.75rem;
      border-radius: var(--radius-sm); display: block; text-align: left;
      word-break: break-all; color: var(--text-secondary); line-height: 1.6;
      border: 1px solid var(--border); }

    /* === Reduce motion === */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important;
        animation-delay: 0.01ms !important; transition-duration: 0.01ms !important; }
    }

    /* === Print: disable all animations, ensure visibility === */
    @media print {
      .finding, .action-item, .exec-card { opacity: 1; animation: none; }
      .score-arc-animated { animation: none; filter: none; }
      .score-number-animated { animation: none; opacity: 1; }
      .radar-polygon, .radar-fill-area, .radar-dot { animation: none; opacity: 1; }
      .heatmap-cell { animation: none; opacity: 1; }
      .share-section { display: none; }
      .verdict-line { width: 100%; animation: none; }
    }

    /* === Mobile Enhancements === */
    @media(max-width:640px) {
      .heatmap-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
      .share-buttons { flex-direction: column; align-items: center; }
      .share-btn { width: 100%; max-width: 280px; justify-content: center; }
      .badge-code { font-size: 0.58rem; }
      .score-trajectory { flex-wrap: wrap; }
    }
  `;
}
