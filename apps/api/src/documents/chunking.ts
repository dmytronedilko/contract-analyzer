import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import type { PageText } from './pdf-text-extractor.service.js';

/** ~300 tokens: small enough to retrieve a single clause, large enough to keep it whole. */
export const CHUNK_SIZE = 1200;
/** Overlap so a clause cut at a boundary still appears whole in one of the two chunks. */
export const CHUNK_OVERLAP = 250;

/** Joins pages in the concatenated text; a paragraph break, which the splitter prefers. */
const PAGE_SEPARATOR = '\n\n';

export interface Chunk {
  chunkIndex: number;
  content: string;
  pageStart: number;
  pageEnd: number;
}

interface PageSpan {
  pageNumber: number;
  /** Offsets of the page's text in the concatenated document, [start, end). */
  start: number;
  end: number;
}

export interface ConcatenatedPages {
  text: string;
  spans: PageSpan[];
}

/** Concatenates non-empty pages, recording where each page's text starts and ends. */
export function concatenatePages(pages: readonly PageText[]): ConcatenatedPages {
  const spans: PageSpan[] = [];
  let text = '';
  for (const page of pages) {
    if (!page.text) continue;
    if (text) text += PAGE_SEPARATOR;
    spans.push({
      pageNumber: page.pageNumber,
      start: text.length,
      end: text.length + page.text.length,
    });
    text += page.text;
  }
  return { text, spans };
}

/** The page containing `offset`; offsets in a separator belong to the preceding page. */
function pageAt(spans: readonly PageSpan[], offset: number): number {
  let low = 0;
  let high = spans.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (spans[mid]!.start <= offset) low = mid;
    else high = mid - 1;
  }
  return spans[low]!.pageNumber;
}

/**
 * Maps each chunk back to the pages it spans. The splitter returns plain strings, but each one is
 * a (trimmed) substring of the concatenated text and chunks come in document order, so each is
 * located by searching forward from the previous chunk's start.
 */
export function mapChunksToPages(document: ConcatenatedPages, chunks: readonly string[]): Chunk[] {
  if (!document.spans.length) return [];
  let cursor = 0;
  return chunks.map((content, chunkIndex) => {
    let start = document.text.indexOf(content, cursor);
    if (start === -1) {
      // Not expected from the splitter; fall back to the cursor rather than failing ingestion.
      start = Math.min(cursor, document.text.length - 1);
    }
    const end = Math.min(start + content.length, document.text.length) - 1;
    cursor = start + 1;
    return {
      chunkIndex,
      content,
      pageStart: pageAt(document.spans, start),
      pageEnd: pageAt(document.spans, Math.max(start, end)),
    };
  });
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
});

/** Splits a document's pages into overlapping chunks annotated with their page range. */
export async function chunkPages(pages: readonly PageText[]): Promise<Chunk[]> {
  const document = concatenatePages(pages);
  if (!document.text) return [];
  return mapChunksToPages(document, await splitter.splitText(document.text));
}
