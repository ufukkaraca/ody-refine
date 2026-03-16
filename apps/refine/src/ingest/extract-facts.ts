/**
 * LLM-based fact extraction from text content.
 * @module ingest/extract-facts
 */
import type { LLMProvider, NamedEntity } from '@useody/platform-core';
import { parseLlmJsonResponse } from '@useody/platform-core';

/** Result of fact extraction from a text chunk. */
export interface FactExtractionResult {
  facts: string[];
  entities: NamedEntity[];
}

const EXTRACTION_PROMPT = `Extract key facts and named entities from the following text.

Return a JSON object with this exact shape:
{
  "facts": ["fact 1", "fact 2", ...],
  "entities": [{"name": "EntityName", "type": "person|org|tool|project|date|custom"}, ...]
}

Rules:
- Facts should be concise, standalone statements
- Only include clearly stated facts, not opinions or speculation
- Entity types: person, org, tool, project, date, custom
- Return valid JSON only

Text:
`;

/**
 * Extract facts and named entities from text using an LLM.
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

  return {
    facts: Array.isArray(parsed.data.facts) ? parsed.data.facts : [],
    entities: Array.isArray(parsed.data.entities) ? parsed.data.entities : [],
  };
}
