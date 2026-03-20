/**
 * @ody/export — JSONL export and HTML health report generation.
 * @module @ody/export
 */

export { exportNodesToJsonl, exportPreferencePairsToJsonl, exportCombinedToJsonl } from './jsonl.js';
export { exportTrlDpoToJsonl, exportSftToJsonl } from './trl-adapter.js';
export type { TrlDpoRecord, TrlSftRecord, SftExportOptions } from './trl-adapter.js';
export { generateHtmlReport } from './html-report.js';
export { generateTickets, ticketsToMarkdown, ticketsToJson } from './tickets.js';
export type { Ticket } from './tickets.js';
export {
  getReportCss,
  renderHeader,
  renderScore,
  renderSummaryCards,
  renderFooter,
} from './html-template.js';
export {
  computeDimensions,
  renderScoreGauge,
  renderDimensionBars,
  renderContradictionMap,
  buildRiskRegister,
} from './html-charts.js';
export type { DimensionScore } from './html-charts.js';
// Consulting-grade report (new analysis engine)
export { generateConsultingReport } from './consulting-report.js';
export type {
  ConsultingFinding,
  FindingCategory,
  HealthScore,
  DocumentInfo,
  AnalysisResult,
} from './consulting-types.js';
export { CATEGORY_LABELS, EFFORT_LABELS, CATEGORY_ICONS } from './consulting-types.js';
export { renderShareSection } from './consulting-share.js';
