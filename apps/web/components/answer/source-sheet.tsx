'use client';

import type { ReactNode } from 'react';

import { FileText } from 'lucide-react';

import type { Source } from '@repo/contracts';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export function pagesLabel(source: Pick<Source, 'pageStart' | 'pageEnd'>): string {
  return source.pageStart === source.pageEnd
    ? `p. ${source.pageStart}`
    : `pp. ${source.pageStart}–${source.pageEnd}`;
}

/**
 * Where the cited page of the original PDF opens: in the page's own viewer (`show`), or otherwise
 * in a new tab (`href`).
 */
export interface PdfPageLink {
  href: string;
  show?: () => void;
}

/** Opens a retrieved excerpt with its page range and similarity, and a link to its page. */
export function SourceSheet({
  source,
  title,
  trigger,
  pdf,
}: {
  source: Source;
  title: string;
  trigger: ReactNode;
  pdf?: PdfPageLink;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {pagesLabel(source)} · similarity {source.similarity.toFixed(2)}
          </SheetDescription>
        </SheetHeader>
        <blockquote className="mx-4 border-l-2 pl-4 text-sm leading-relaxed whitespace-pre-wrap">
          {source.content}
        </blockquote>
        {pdf ? (
          <div className="mx-4 pb-4">
            {pdf.show ? (
              <SheetClose asChild>
                <Button variant="outline" size="sm" onClick={pdf.show}>
                  <FileText aria-hidden />
                  Show {pagesLabel(source)} in the document
                </Button>
              </SheetClose>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <a href={pdf.href} target="_blank" rel="noopener">
                  <FileText aria-hidden />
                  Open {pagesLabel(source)} in the PDF
                </a>
              </Button>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
