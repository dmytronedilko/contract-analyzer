'use client';

import type { z } from 'zod';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { MarkdownAnswer, type SourceLookup } from '@/components/answer/markdown-answer';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { compare, documentFileUrl, listDocuments } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { useApiErrorHandler } from '@/lib/use-api-error';
import {
  CompareRequestSchema,
  NOT_FOUND_COMPARE,
  QUESTION_MAX_LENGTH,
  type CompareRequest,
  type CompareResponse,
  type Document,
} from '@repo/contracts';

import { NotFoundCallout, TruncatedWarning } from './answer-notices';
import { CompareSources } from './compare-sources';
import { CopyButton } from './copy-button';
import { PendingAnswer } from './pending-answer';

type CompareInput = z.input<typeof CompareRequestSchema>;

interface ResultDocument {
  filename: string;
  /** The original PDF at a page, when the document has a stored file. */
  pageUrl?: (page: number) => string;
}

function describe(documents: Document[] | undefined, id: string): ResultDocument {
  const document = documents?.find((candidate) => candidate.id === id);
  if (!document) return { filename: 'Unknown document' };
  return document.hasFile
    ? { filename: document.filename, pageUrl: (page) => documentFileUrl(id, page) }
    : { filename: document.filename };
}

interface Result {
  a: ResultDocument;
  b: ResultDocument;
  response: CompareResponse;
}

function link(pageUrl?: (page: number) => string) {
  return pageUrl ? (page: number) => ({ href: pageUrl(page) }) : undefined;
}

/** Citation chips open the cited page of each PDF in a new tab. */
function pageLinks({ a, b }: Result): SourceLookup['pdf'] {
  const A = link(a.pageUrl);
  const B = link(b.pageUrl);
  return { ...(A ? { A } : {}), ...(B ? { B } : {}) };
}

export function CompareView() {
  const handleError = useApiErrorHandler();
  const [controller, setController] = useState<AbortController | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Only ready documents can be compared.
  const documents = useQuery({
    queryKey: queryKeys.documents.ready,
    queryFn: async ({ signal }) => {
      const page = await listDocuments({ limit: 100, offset: 0 }, signal);
      return page.items.filter((document) => document.status === 'ready');
    },
  });

  useEffect(() => {
    if (documents.error) handleError(documents.error);
  }, [documents.error, handleError]);

  const form = useForm<CompareInput, unknown, CompareRequest>({
    resolver: zodResolver(CompareRequestSchema),
    defaultValues: { documentId1: '', documentId2: '', query: '' },
  });
  const firstId = useWatch({ control: form.control, name: 'documentId1' });

  const comparison = useMutation({
    mutationFn: ({ request, signal }: { request: CompareRequest; signal: AbortSignal }) =>
      compare(request, signal),
    onError: (error) => handleError(error),
  });

  const onSubmit = form.handleSubmit((request) => {
    const next = new AbortController();
    setController(next);
    comparison.mutate(
      { request, signal: next.signal },
      {
        onSuccess: (response) =>
          setResult({
            a: describe(documents.data, request.documentId1),
            b: describe(documents.data, request.documentId2),
            response,
          }),
      },
    );
  });

  const errors = form.formState.errors;
  const options = documents.data ?? [];
  const notFound = result?.response.analysis.trim() === NOT_FOUND_COMPARE;

  return (
    <div className="space-y-6">
      {documents.error ? <ErrorMessage error={documents.error} /> : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="document-a">Contract A</Label>
            <Controller
              control={form.control}
              name="documentId1"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (value === form.getValues('documentId2')) form.setValue('documentId2', '');
                  }}
                >
                  <SelectTrigger id="document-a" className="w-full">
                    <SelectValue placeholder="Choose a document" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((document) => (
                      <SelectItem key={document.id} value={document.id}>
                        {document.filename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.documentId1 ? (
              <p className="text-sm text-destructive">Choose contract A.</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="document-b">Contract B</Label>
            <Controller
              control={form.control}
              name="documentId2"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="document-b" className="w-full">
                    <SelectValue placeholder="Choose a document" />
                  </SelectTrigger>
                  <SelectContent>
                    {options
                      .filter((document) => document.id !== firstId)
                      .map((document) => (
                        <SelectItem key={document.id} value={document.id}>
                          {document.filename}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.documentId2 ? (
              <p className="text-sm text-destructive">
                {errors.documentId2.type === 'custom'
                  ? errors.documentId2.message
                  : 'Choose contract B.'}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="compare-query">What should be compared?</Label>
          <Textarea
            id="compare-query"
            rows={2}
            maxLength={QUESTION_MAX_LENGTH}
            placeholder="e.g. Termination rights and notice periods"
            aria-invalid={errors.query ? true : undefined}
            disabled={comparison.isPending}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void onSubmit();
              }
            }}
            {...form.register('query')}
          />
          {errors.query ? (
            <p className="text-sm text-destructive">Describe what to compare.</p>
          ) : null}
        </div>

        {comparison.error && !(comparison.error instanceof DOMException) ? (
          <ErrorMessage error={comparison.error} />
        ) : null}
        <Button type="submit" disabled={comparison.isPending || options.length < 2}>
          Compare
        </Button>
        {documents.data && options.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            You need at least two ready documents to compare.
          </p>
        ) : null}
      </form>

      {comparison.isPending ? (
        <PendingAnswer label="Comparing the contracts" onCancel={() => controller?.abort()} />
      ) : null}

      {result && !comparison.isPending ? (
        <section className="space-y-6" aria-label="Comparison">
          <article className="space-y-3 rounded-md border p-4">
            {notFound ? (
              <NotFoundCallout sentence={NOT_FOUND_COMPARE} />
            ) : (
              <MarkdownAnswer
                markdown={result.response.analysis}
                sources={{
                  A: result.response.sources.contractA,
                  B: result.response.sources.contractB,
                  labels: {
                    A: `Contract A: ${result.a.filename}`,
                    B: `Contract B: ${result.b.filename}`,
                  },
                  pdf: pageLinks(result),
                }}
              />
            )}
            {result.response.truncated ? <TruncatedWarning /> : null}
            <div className="flex justify-end">
              <CopyButton text={result.response.analysis} label="Copy analysis" />
            </div>
          </article>
          <CompareSources a={result.a} b={result.b} sources={result.response.sources} />
        </section>
      ) : null}
    </div>
  );
}
