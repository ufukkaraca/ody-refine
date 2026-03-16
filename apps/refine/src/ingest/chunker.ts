/**
 * Content chunking for markdown and PDF files.
 * @module ingest/chunker
 */

/** A chunk of content with positional metadata. */
export interface Chunk {
  text: string;
  metadata: {
    heading?: string;
    pageNumber?: number;
    charOffset: number;
  };
}

const MAX_CHUNK_SIZE = 2000;
const MIN_CHUNK_SIZE = 100;
const PDF_WINDOW_SIZE = 1500;
const PDF_OVERLAP = 200;

/**
 * Chunk markdown content by heading boundaries.
 * Sections larger than 2000 chars are split at paragraph boundaries.
 * Tiny sections under 100 chars are merged with the next section.
 */
export function chunkMarkdown(content: string): Chunk[] {
  if (!content.trim()) return [];

  const sections = splitByHeadings(content);
  const expanded = splitOversizedSections(sections);
  const merged = mergeTinySections(expanded);

  let charOffset = 0;
  const chunks: Chunk[] = [];

  for (const section of merged) {
    chunks.push({
      text: section.text,
      metadata: {
        heading: section.heading,
        charOffset,
      },
    });
    charOffset += section.text.length;
  }

  return chunks;
}

interface Section {
  heading?: string;
  text: string;
}

function splitByHeadings(content: string): Section[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const sections: Section[] = [];
  let lastIndex = 0;
  let lastHeading: string | undefined;

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    const textBefore = content.slice(lastIndex, match.index).trim();
    if (textBefore || sections.length === 0) {
      sections.push({ heading: lastHeading, text: textBefore });
    }
    lastHeading = match[2];
    lastIndex = match.index + match[0].length;
  }

  const remaining = content.slice(lastIndex).trim();
  if (remaining) {
    sections.push({ heading: lastHeading, text: remaining });
  }

  return sections.filter((s) => s.text.length > 0);
}

function splitOversizedSections(sections: Section[]): Section[] {
  const result: Section[] = [];

  for (const section of sections) {
    if (section.text.length <= MAX_CHUNK_SIZE) {
      result.push(section);
      continue;
    }

    const paragraphs = section.text.split(/\n\n+/);
    let buffer = '';

    for (const para of paragraphs) {
      if (buffer.length + para.length + 2 > MAX_CHUNK_SIZE && buffer.length > 0) {
        result.push({ heading: section.heading, text: buffer.trim() });
        buffer = '';
      }
      buffer += (buffer ? '\n\n' : '') + para;
    }

    if (buffer.trim()) {
      result.push({ heading: section.heading, text: buffer.trim() });
    }
  }

  return result;
}

function mergeTinySections(sections: Section[]): Section[] {
  const result: Section[] = [];

  for (const section of sections) {
    const prev = result[result.length - 1];
    // Only merge into previous if the previous section has no heading and is tiny
    if (prev && prev.text.length < MIN_CHUNK_SIZE && !section.heading) {
      prev.text += '\n\n' + section.text;
    } else if (prev && !prev.heading && prev.text.length < MIN_CHUNK_SIZE) {
      // Merge tiny headingless previous into current section
      prev.text += '\n\n' + section.text;
      if (section.heading) {
        prev.heading = section.heading;
      }
    } else {
      result.push({ ...section });
    }
  }

  return result;
}

/**
 * Chunk a PDF buffer into fixed-size windows with overlap.
 * Uses 1500 char windows with 200 char overlap.
 */
export async function chunkPdf(buffer: Buffer): Promise<Chunk[]> {
  const pdfParse = (await import('pdf-parse')).default;
  const parsed = await pdfParse(buffer);
  const text = parsed.text;

  if (!text.trim()) return [];

  const chunks: Chunk[] = [];
  let offset = 0;
  let pageEstimate = 1;
  const charsPerPage = Math.max(1, Math.floor(text.length / Math.max(1, parsed.numpages)));

  while (offset < text.length) {
    const end = Math.min(offset + PDF_WINDOW_SIZE, text.length);
    const chunkText = text.slice(offset, end).trim();

    if (chunkText.length > 0) {
      pageEstimate = Math.floor(offset / charsPerPage) + 1;
      chunks.push({
        text: chunkText,
        metadata: {
          pageNumber: pageEstimate,
          charOffset: offset,
        },
      });
    }

    offset += PDF_WINDOW_SIZE - PDF_OVERLAP;
  }

  return chunks;
}
