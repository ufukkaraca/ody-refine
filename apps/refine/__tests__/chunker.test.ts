import { describe, it, expect } from 'vitest';
import { chunkMarkdown } from '../src/ingest/chunker.js';

describe('chunkMarkdown', () => {
  it('splits on heading boundaries', () => {
    const content = `# Section 1
Some content here.

# Section 2
More content here.

# Section 3
Final content.`;

    const chunks = chunkMarkdown(content);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.metadata.heading).toBe('Section 1');
    expect(chunks[1]!.metadata.heading).toBe('Section 2');
    expect(chunks[2]!.metadata.heading).toBe('Section 3');
  });

  it('merges tiny sections under 100 chars', () => {
    // Headingless tiny sections get merged into the next section
    const content = `Preamble

# Main
This is the main section with enough content to stand on its own because it has over one hundred characters of text in the body.`;

    const chunks = chunkMarkdown(content);
    // "Preamble" (8 chars, no heading) should be merged into "Main" section
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.text).toContain('Preamble');
    expect(chunks[0]!.metadata.heading).toBe('Main');
  });

  it('splits oversized sections at paragraph boundaries', () => {
    const longParagraph = 'A'.repeat(1200);
    const content = `# Big Section

${longParagraph}

${longParagraph}

${longParagraph}`;

    const chunks = chunkMarkdown(content);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(2100); // some tolerance
    }
  });

  it('preserves heading metadata', () => {
    const content = `# Main Title
Intro text here.

## Sub Section
Sub content.

### Deep Section
Deep content here with enough text.`;

    const chunks = chunkMarkdown(content);
    const headings = chunks.map((c) => c.metadata.heading).filter(Boolean);
    expect(headings).toContain('Main Title');
    expect(headings).toContain('Sub Section');
    expect(headings).toContain('Deep Section');
  });

  it('handles content with no headings', () => {
    const content = `Just some text without any headings.

Another paragraph here with more content that should be chunked properly.`;

    const chunks = chunkMarkdown(content);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.metadata.heading).toBeUndefined();
  });

  it('returns empty array for empty content', () => {
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('   ')).toEqual([]);
  });

  it('sets charOffset metadata', () => {
    const content = `# First
Content A.

# Second
Content B.`;

    const chunks = chunkMarkdown(content);
    expect(chunks[0]!.metadata.charOffset).toBe(0);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    if (chunks[1]) {
      expect(chunks[1].metadata.charOffset).toBeGreaterThan(0);
    }
  });
});
