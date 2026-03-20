/**
 * LLM-based fact extraction and document classification.
 * @module ingest/extract-facts
 */
import type { LLMProvider, NamedEntity } from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';

/** Result of fact extraction from a text chunk. */
export interface FactExtractionResult {
  facts: string[];
  entities: NamedEntity[];
  /** Document type classification — informs detector behavior. */
  docType?: DocType;
}

/** Types of documentation content. Detectors adjust behavior per type. */
export type DocType =
  | 'meeting_notes'     // Snapshot in time, not source of truth
  | 'policy'            // Rules/guidelines, should be consistent across docs
  | 'architecture'      // Technical design, may have multiple valid perspectives
  | 'api_reference'     // Specs that must be precise and consistent
  | 'guide'             // How-to content, may describe same thing differently
  | 'config'            // Settings/parameters, not prose contradictions
  | 'changelog'         // Historical record, newer supersedes older
  | 'general';          // Default

const EXTRACTION_PROMPT = `Analyze this documentation text. Extract facts, entities, and classify the document type.

Return JSON only:
{
  "facts": ["concise standalone statements of fact"],
  "entities": [{"name": "Name", "type": "person|org|tool|project|date|custom"}],
  "docType": "meeting_notes|policy|architecture|api_reference|guide|config|changelog|general"
}

Document type rules:
- meeting_notes: contains dates, action items, attendees, decisions made at a specific time
- policy: rules, guidelines, compliance requirements, "must/should/shall" language
- api_reference: endpoints, parameters, rate limits, status codes, request/response formats
- architecture: system design, component diagrams, data flow, technical decisions
- guide: tutorials, how-tos, step-by-step instructions, getting started
- config: settings, parameters, toggle descriptions, default values
- changelog: version history, release notes, what changed when
- general: anything else

Facts rules:
- Concise, standalone statements
- Only clearly stated facts, not opinions
- Include specific numbers, dates, deadlines, limits, policies
- Max 10 facts per chunk

Text:
`;

/**
 * Extract facts, entities, and document type using an LLM.
 * Returns empty results if the LLM response cannot be parsed.
 */
export async function extractFacts(
  text: string,
  llm: LLMProvider,
): Promise<FactExtractionResult> {
  const response = await llm.complete([
    { role: 'user', content: EXTRACTION_PROMPT + text },
  ], { temperature: 0.1, maxTokens: 2048 });

  const parsed = parseLlmJsonResponse<FactExtractionResult>(response);

  if (!parsed.data) {
    return { facts: [], entities: [] };
  }

  const validTypes: DocType[] = [
    'meeting_notes', 'policy', 'architecture', 'api_reference',
    'guide', 'config', 'changelog', 'general',
  ];
  const docType = validTypes.includes(parsed.data.docType as DocType)
    ? parsed.data.docType as DocType
    : undefined;

  return {
    facts: Array.isArray(parsed.data.facts) ? parsed.data.facts : [],
    entities: Array.isArray(parsed.data.entities) ? parsed.data.entities : [],
    docType,
  };
}
