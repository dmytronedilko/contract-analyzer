import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  chunkPages,
  concatenatePages,
  mapChunksToPages,
} from './chunking.js';
import { normalizeText } from './pdf-text-extractor.service.js';

/**
 * Deterministic pseudo-legal text: one long paragraph of numbered clauses per page (~2,600
 * characters), so the splitter must cut inside pages and overlap consecutive chunks.
 */
function pageText(page: number): string {
  return Array.from(
    { length: 40 },
    (_, s) => `Clause ${page}.${s + 1} the Supplier shall perform the obligations.`,
  ).join(' ');
}

describe('concatenatePages', () => {
  it('records page offsets and skips empty pages', () => {
    const { text, spans } = concatenatePages([
      { pageNumber: 1, text: 'alpha' },
      { pageNumber: 2, text: '' },
      { pageNumber: 3, text: 'gamma' },
    ]);
    expect(text).toBe('alpha\n\ngamma');
    expect(spans).toEqual([
      { pageNumber: 1, start: 0, end: 5 },
      { pageNumber: 3, start: 7, end: 12 },
    ]);
    for (const span of spans) expect(text.slice(span.start, span.end)).not.toContain('\n');
  });
});

describe('mapChunksToPages', () => {
  const document = concatenatePages([
    { pageNumber: 1, text: 'one two three' },
    { pageNumber: 2, text: 'four five six' },
    { pageNumber: 5, text: 'seven eight' },
  ]);

  it('maps chunks within a page and across pages', () => {
    const chunks = mapChunksToPages(document, [
      'one two',
      'three\n\nfour five',
      'six\n\nseven eight',
      'eight',
    ]);
    expect(chunks.map(({ pageStart, pageEnd }) => [pageStart, pageEnd])).toEqual([
      [1, 1],
      [1, 2],
      [2, 5],
      [5, 5],
    ]);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1, 2, 3]);
  });

  it('finds the later occurrence of repeated text by searching forward', () => {
    const repeated = concatenatePages([
      { pageNumber: 1, text: 'Notices. Notices.' },
      { pageNumber: 2, text: 'Notices.' },
    ]);
    const chunks = mapChunksToPages(repeated, ['Notices.', 'Notices.', 'Notices.']);
    expect(chunks.map((chunk) => chunk.pageStart)).toEqual([1, 1, 2]);
  });

  it('returns no chunks for a document without text', () => {
    expect(mapChunksToPages(concatenatePages([{ pageNumber: 1, text: '' }]), ['x'])).toEqual([]);
  });
});

describe('chunkPages', () => {
  const pages = Array.from({ length: 12 }, (_, i) => ({
    pageNumber: i + 1,
    text: pageText(i + 1),
  }));

  it('produces ordered chunks within the size limit', async () => {
    const chunks = await chunkPages(pages);
    expect(chunks.length).toBeGreaterThan(pages.length);
    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.chunkIndex).toBe(index);
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_SIZE);
      expect(chunk.pageStart).toBeLessThanOrEqual(chunk.pageEnd);
    }
  });

  it('assigns the pages that actually contain each chunk', async () => {
    const chunks = await chunkPages(pages);
    for (const chunk of chunks) {
      const pagesInChunk = [...chunk.content.matchAll(/Clause (\d+)\./g)].map((m) => Number(m[1]));
      expect(Math.min(...pagesInChunk)).toBeGreaterThanOrEqual(chunk.pageStart);
      expect(Math.max(...pagesInChunk)).toBeLessThanOrEqual(chunk.pageEnd);
    }
  });

  it('locates every splitter chunk verbatim in the source text', async () => {
    const { text } = concatenatePages(pages);
    let cursor = 0;
    for (const chunk of await chunkPages(pages)) {
      const start = text.indexOf(chunk.content, cursor);
      expect(start).toBeGreaterThanOrEqual(0);
      cursor = start + 1;
    }
  });

  it('overlaps consecutive chunks', async () => {
    const chunks = await chunkPages(pages);
    const overlapping = chunks
      .slice(1)
      .filter((chunk, i) => chunks[i]!.content.includes(chunk.content.slice(0, 40)));
    expect(overlapping.length).toBeGreaterThan(0);
    expect(CHUNK_OVERLAP).toBeLessThan(CHUNK_SIZE);
  });

  it('skips empty pages without shifting page numbers', async () => {
    const chunks = await chunkPages([
      { pageNumber: 1, text: '' },
      { pageNumber: 2, text: 'Payment is due within 30 days.' },
      { pageNumber: 3, text: '' },
      { pageNumber: 4, text: 'Either party may terminate on notice.' },
    ]);
    expect(chunks).toEqual([
      {
        chunkIndex: 0,
        content: 'Payment is due within 30 days.\n\nEither party may terminate on notice.',
        pageStart: 2,
        pageEnd: 4,
      },
    ]);
  });

  it('returns nothing for a document without text', async () => {
    expect(await chunkPages([{ pageNumber: 1, text: '' }])).toEqual([]);
  });

  it('keeps its invariants for arbitrary pages', async () => {
    // Pages of words and line breaks, some empty, numbered in increasing order with gaps.
    const word = fc.stringMatching(/^[A-Za-z0-9.,;:()-]{1,15}$/);
    const page = fc
      .array(fc.tuple(word, fc.constantFrom(' ', ' ', ' ', '\n')), { maxLength: 400 })
      .map((parts) => parts.flat().join('').trim());
    const document = fc
      .array(fc.tuple(fc.integer({ min: 1, max: 3 }), page), { maxLength: 8 })
      .map((entries) => {
        let pageNumber = 0;
        return entries.map(([gap, text]) => ({ pageNumber: (pageNumber += gap), text }));
      });
    await fc.assert(
      fc.asyncProperty(document, async (pages) => {
        const { text, spans } = concatenatePages(pages);
        const pageNumbers = spans.map((span) => span.pageNumber);
        let cursor = 0;
        for (const [index, chunk] of (await chunkPages(pages)).entries()) {
          expect(chunk.chunkIndex).toBe(index);
          expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_SIZE);
          const start = text.indexOf(chunk.content, cursor);
          expect(start).toBeGreaterThanOrEqual(0);
          cursor = start + 1;
          expect(pageNumbers).toContain(chunk.pageStart);
          expect(pageNumbers).toContain(chunk.pageEnd);
          expect(chunk.pageStart).toBeLessThanOrEqual(chunk.pageEnd);
        }
      }),
      { numRuns: 50 },
    );
  });
});

describe('normalizeText', () => {
  it('collapses whitespace and blank lines without changing words', () => {
    expect(normalizeText('  Term:\r\n\r\n\r\n\r\nOne\t  year .  \n  Fees\0 ')).toBe(
      'Term:\n\nOne year .\nFees',
    );
  });
});
