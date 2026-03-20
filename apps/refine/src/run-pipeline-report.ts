/**
 * Report generation + output step for the pipeline.
 * Extracted from run-pipeline.ts to keep files under 250 lines.
 * @module run-pipeline-report
 */
import { resolve } from 'node:path';
import {
  printDetectionSummary,
  openHtmlReport,
} from './output/index.js';
import { safeWriteFileSync } from './safe-write.js';

/** Options for generating and opening the report. */
export interface ReportOptions {
  consultingResult?: import('@useody/export').AnalysisResult;
  finalDetections: import('@useody/platform-core').Detection[];
  filesDiscovered: number;
  totalDuration: number;
  dataDir: string;
  startTime: number;
}

/** Generate HTML report, write to disk, print summary, and open in browser. Returns overall health score. */
export async function generateAndOpenReport(opts: ReportOptions): Promise<number> {
  let reportResult: import('@useody/export').AnalysisResult;
  if (opts.consultingResult) {
    reportResult = {
      ...opts.consultingResult,
      metadata: { ...opts.consultingResult.metadata, documentCount: opts.filesDiscovered },
    };
  } else {
    const { detectionsToAnalysisResult } = await import('./detect/detections-to-analysis.js');
    reportResult = detectionsToAnalysisResult(opts.finalDetections, {
      fileCount: opts.filesDiscovered, durationMs: opts.totalDuration,
    });
  }
  const { generateConsultingReport } = await import('@useody/export');
  const html = generateConsultingReport(reportResult);

  const reportPath = resolve(opts.dataDir, 'report.html');
  safeWriteFileSync(reportPath, html);

  printDetectionSummary(opts.finalDetections, {
    durationMs: Date.now() - opts.startTime, fileCount: opts.filesDiscovered,
    reportPath, healthScore: reportResult.healthScore.overall,
  });

  await openHtmlReport(reportPath);
  return reportResult.healthScore.overall;
}
