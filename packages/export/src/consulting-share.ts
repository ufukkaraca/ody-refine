/**
 * Share section and badge generator for the consulting report.
 * Produces Twitter/X share links, LinkedIn share, and README badge.
 * @module consulting-share
 */

import type { AnalysisResult } from './consulting-types.js';
import { escapeHtml } from './html-template.js';

/**
 * Render the "Share this report" section with social links and README badge.
 * Placed at the bottom of the report before the footer.
 */
export function renderShareSection(result: AnalysisResult): string {
  const { healthScore, findings } = result;
  const score = healthScore.overall;
  const issueCount = findings.length;
  const critical = findings.filter((f) => f.severity === 'critical').length;

  // Compose tweet text (punchy, fits in 280 chars)
  const tweetParts = [`Just ran @useody Refine on our docs.`];
  if (issueCount > 0) {
    tweetParts.push(`Found ${String(issueCount)} issue${issueCount !== 1 ? 's' : ''}${critical > 0 ? ` (${String(critical)} critical)` : ''} we didn\u2019t know about.`);
  } else {
    tweetParts.push(`Clean bill of health.`);
  }
  tweetParts.push(`\n\nHealth score: ${String(score)}/100`);
  tweetParts.push(`\n\nnpx ody-refine ./docs/`);
  const tweetText = encodeURIComponent(tweetParts.join(' '));
  const twitterUrl = `https://x.com/intent/tweet?text=${tweetText}`;

  // LinkedIn share — shareArticle supports title + summary + source
  const linkedinTitle = encodeURIComponent(`Knowledge Health Score: ${String(score)}/100`);
  const linkedinSummary = encodeURIComponent(
    `Ran an AI-powered health assessment on our documentation using Ody Refine. `
    + `Score: ${String(score)}/100 with ${String(issueCount)} issue${issueCount !== 1 ? 's' : ''} found.`,
  );
  const linkedinUrl = `https://www.linkedin.com/shareArticle?mini=true`
    + `&url=${encodeURIComponent('https://github.com/ufukkaraca/ody-platform')}`
    + `&title=${linkedinTitle}`
    + `&summary=${linkedinSummary}`
    + `&source=Ody+Refine`;

  // Badge SVG data URI
  const badgeColor = score >= 80 ? '2d8a54' : score >= 50 ? 'b8860b' : 'c03030';
  const badgeSvg = renderBadgeSvg(score, badgeColor);
  const badgeDataUri = `data:image/svg+xml,${encodeURIComponent(badgeSvg)}`;
  const badgeMarkdown = `![Knowledge Health](${badgeDataUri})`;
  const badgeHtml = `<img src="${escapeHtml(badgeDataUri)}" alt="Knowledge Health: ${String(score)}/100">`;

  // Copy-to-clipboard button (tiny inline JS for self-contained HTML)
  const copyScript = `onclick="navigator.clipboard.writeText('npx ody-refine ./docs/').then(function(){this.textContent='Copied!'}.bind(this))"`;

  return `<div class="share-section">
  <div class="share-title">Share this assessment</div>
  <div class="share-buttons">
    <a class="share-btn twitter" href="${escapeHtml(twitterUrl)}" target="_blank" rel="noopener" aria-label="Share this report on X (formerly Twitter)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      Post on X
    </a>
    <a class="share-btn linkedin" href="${escapeHtml(linkedinUrl)}" target="_blank" rel="noopener" aria-label="Share this report on LinkedIn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/></svg>
      Share on LinkedIn
    </a>
    <button class="share-btn copy" ${copyScript} aria-label="Copy install command to clipboard">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      Copy install command
    </button>
  </div>
  <div class="badge-section">
    <p>Add a health badge to your README:</p>
    <code class="badge-code">${escapeHtml(badgeMarkdown)}</code>
    <p style="margin-top:0.5rem">Or as HTML:</p>
    <code class="badge-code">${escapeHtml(badgeHtml)}</code>
  </div>
</div>`;
}

/** Generate a small inline SVG badge for "Knowledge Health: XX/100". */
function renderBadgeSvg(score: number, color: string): string {
  const labelWidth = 108;
  const valueWidth = 48;
  const totalWidth = labelWidth + valueWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(totalWidth)}" height="20" role="img" aria-label="Knowledge Health: ${String(score)}/100">
  <title>Knowledge Health: ${String(score)}/100</title>
  <linearGradient id="s"><stop offset="0" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${String(totalWidth)}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${String(labelWidth)}" height="20" fill="#555"/>
    <rect x="${String(labelWidth)}" width="${String(valueWidth)}" height="20" fill="#${color}"/>
    <rect width="${String(totalWidth)}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${String(labelWidth / 2)}" y="14">knowledge health</text>
    <text x="${String(labelWidth + valueWidth / 2)}" y="14">${String(score)}/100</text>
  </g>
</svg>`;
}
