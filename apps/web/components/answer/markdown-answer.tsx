'use client';

import { createContext, useContext, type ComponentProps } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { Source } from '@repo/contracts';

import { linkCitations, parseCitationHref, type ContractSide } from '@/lib/citations';

import { SourceSheet, type PdfPageLink } from './source-sheet';

export interface SourceLookup {
  /** Sources cited without a side (Q&A). */
  single?: readonly Source[];
  /** Sources for [A: ...] and [B: ...] citations (comparison). */
  A?: readonly Source[];
  B?: readonly Source[];
  /** Display names for the sheet title, e.g. "Contract A: msa.pdf". */
  labels?: Partial<Record<ContractSide | 'single', string>>;
  /** The cited page of each original PDF; absent for a document without a stored file. */
  pdf?: Partial<Record<ContractSide | 'single', (page: number) => PdfPageLink>>;
}

const SourcesContext = createContext<SourceLookup>({});

type MarkdownProps<T extends 'a' | 'table'> = ComponentProps<T> & { node?: unknown };

/** Links: citation chips for #cite-... hrefs, external links otherwise. */
function AnswerLink({ href, children, node: _node, ...rest }: MarkdownProps<'a'>) {
  const sources = useContext(SourcesContext);
  const target = parseCitationHref(href);
  if (!target) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" {...rest}>
        {children}
      </a>
    );
  }
  const list = target.side ? sources[target.side] : sources.single;
  const source = list?.find((candidate) => candidate.ref === target.ref);
  // A citation the sources don't contain stays plain text rather than a broken chip.
  if (!source) return <span>{children}</span>;
  const label = sources.labels?.[target.side ?? 'single'];
  const name = target.side ? `${target.side}${target.ref}` : String(target.ref);
  const pdf = sources.pdf?.[target.side ?? 'single']?.(source.pageStart);
  return (
    <SourceSheet
      source={source}
      pdf={pdf}
      title={`${label ? `${label} · ` : ''}Excerpt ${name}`}
      trigger={
        <button
          type="button"
          className="mx-0.5 inline-flex items-center rounded-full border bg-muted px-2 py-0.5 align-baseline text-xs font-medium hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {children}
        </button>
      }
    />
  );
}

/** Comparison tables scroll horizontally on small screens. */
function AnswerTable({ node: _node, ...props }: MarkdownProps<'table'>) {
  return (
    <div className="my-4 overflow-x-auto">
      <table {...props} />
    </div>
  );
}

const components: Components = { a: AnswerLink, table: AnswerTable };

/**
 * Renders a model answer as GitHub-flavored markdown. Raw HTML is never enabled: answers can echo
 * text from uploaded documents. Citations become chips that open the cited excerpt.
 */
export function MarkdownAnswer({ markdown, sources }: { markdown: string; sources: SourceLookup }) {
  return (
    <SourcesContext value={sources}>
      <div className="prose-answer space-y-3 text-sm leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {linkCitations(markdown)}
        </ReactMarkdown>
      </div>
    </SourcesContext>
  );
}
