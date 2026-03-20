/**
 * Heuristic document type classifier.
 * Used as a fallback when no LLM provider is available during ingestion.
 * @module ingest/classify-doc-type
 */
import type { DocType } from './extract-facts.js';

/**
 * Classify a document's type using heuristic pattern matching.
 * Inspects the title and first 500 chars of content for signal patterns.
 * Falls back to 'general' if no pattern matches.
 */
export function classifyDocTypeHeuristic(title: string, content: string): DocType {
  const lower = (title + ' ' + content.slice(0, 500)).toLowerCase();

  // Meeting notes: dates in title, "attendees", "action items", "minutes", "meeting"
  if (/\d{4}-\d{2}-\d{2}.*meeting|meeting.*\d{4}|minutes|attendees|action items/i.test(lower))
    return 'meeting_notes';

  // Changelog: "changelog", "release notes", "what's new", version numbers in title
  if (/changelog|release notes|what'?s new|v\d+\.\d+/i.test(lower))
    return 'changelog';

  // Config: "configuration", "settings", "parameters", "defaults", toggle-heavy
  if (/configuration|settings|parameters|defaults|\.toml|\.yaml|\.json|\.env/i.test(lower))
    return 'config';

  // API reference: "endpoint", "request", "response", "status code", "rate limit"
  if (/endpoint|request.*response|status code|rate limit|api reference|swagger/i.test(lower))
    return 'api_reference';

  // Policy: "policy", "must", "shall", "compliance", "requirement"
  if (/\bpolicy\b|\bmust\b.*\bshall\b|compliance|requirement|guideline/i.test(lower))
    return 'policy';

  // Architecture: "architecture", "design", "component", "diagram", "system"
  if (/architecture|design doc|component.*diagram|system design|adr|decision record/i.test(lower))
    return 'architecture';

  // Guide: "guide", "tutorial", "how to", "getting started", "step 1"
  if (/\bguide\b|tutorial|how to|getting started|step \d|walkthrough/i.test(lower))
    return 'guide';

  return 'general';
}
