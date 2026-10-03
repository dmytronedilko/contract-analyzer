'use client';

import { ChevronDown } from 'lucide-react';

import type { Source } from '@repo/contracts';

import { pagesLabel } from '@/components/answer/source-sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

function SourceColumn({
  title,
  sources,
  side,
  pageUrl,
}: {
  title: string;
  sources: Source[];
  side: 'A' | 'B';
  pageUrl: ((page: number) => string) | undefined;
}) {
  return (
    <section className="min-w-0 space-y-2" aria-label={title}>
      <h3 className="truncate text-sm font-semibold" title={title}>
        {title}
      </h3>
      {sources.length ? (
        <ul className="space-y-2">
          {sources.map((source) => (
            <li key={source.chunkId}>
              <Collapsible className="rounded-md border">
                <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <span>
                    {side}: chunk {source.ref}, {pagesLabel(source)}
                  </span>
                  <ChevronDown
                    className="size-4 transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 border-t px-3 py-2 text-sm">
                  <p className="whitespace-pre-wrap">{source.content}</p>
                  {pageUrl ? (
                    <a
                      className="inline-block text-xs underline"
                      href={pageUrl(source.pageStart)}
                      target="_blank"
                      rel="noopener"
                    >
                      Open {pagesLabel(source)} in the PDF
                    </a>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No excerpts retrieved.</p>
      )}
    </section>
  );
}

interface SourceDocument {
  filename: string;
  pageUrl?: (page: number) => string;
}

export function CompareSources({
  a,
  b,
  sources,
}: {
  a: SourceDocument;
  b: SourceDocument;
  sources: { contractA: Source[]; contractB: Source[] };
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <SourceColumn
        title={`Contract A: ${a.filename}`}
        sources={sources.contractA}
        side="A"
        pageUrl={a.pageUrl}
      />
      <SourceColumn
        title={`Contract B: ${b.filename}`}
        sources={sources.contractB}
        side="B"
        pageUrl={b.pageUrl}
      />
    </div>
  );
}
