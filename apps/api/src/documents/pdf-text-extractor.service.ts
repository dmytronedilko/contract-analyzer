import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

export interface PageText {
  /** 1-based page number. */
  pageNumber: number;
  text: string;
}

export interface ExtractedPdf {
  pageCount: number;
  pages: PageText[];
  /** False for scanned PDFs without a text layer: there is nothing to index. */
  hasText: boolean;
}

/** The file passed the magic-byte check but pdf.js could not parse it. */
export class UnreadablePdfError extends Error {
  override readonly name = 'UnreadablePdfError';
}

/** Extracts the text layer of a PDF page by page, so chunks can be mapped back to pages. */
@Injectable()
export class PdfTextExtractor {
  async extract(buffer: Uint8Array): Promise<ExtractedPdf> {
    // pdf.js may transfer (detach) the buffer it is given, so pass a copy. Eval is disabled:
    // uploaded files are untrusted and font programs don't need it for text extraction.
    const parser = new PDFParse({ data: new Uint8Array(buffer), isEvalSupported: false });
    try {
      const result = await parser.getText();
      const pages = result.pages
        .map((page) => ({ pageNumber: page.num, text: normalizeText(page.text) }))
        .toSorted((a, b) => a.pageNumber - b.pageNumber);
      return {
        pageCount: result.total,
        pages,
        hasText: pages.some((page) => /[\p{L}\p{N}]/u.test(page.text)),
      };
    } catch (error) {
      throw new UnreadablePdfError('The PDF could not be parsed', { cause: error });
    } finally {
      await parser.destroy();
    }
  }
}

/** Normalizes line endings and whitespace without changing the words. */
export function normalizeText(text: string): string {
  return (
    text
      .replaceAll('\0', '')
      .replaceAll(/\r\n?/g, '\n')
      .replaceAll(/[ \t\f\v ]+/g, ' ')
      .replaceAll(/ *\n */g, '\n')
      // Keep paragraph breaks (the splitter prefers them) but drop runs of blank lines.
      .replaceAll(/\n{3,}/g, '\n\n')
      .trim()
  );
}
