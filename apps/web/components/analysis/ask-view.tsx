'use client';

import type { z } from 'zod';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useForm } from 'react-hook-form';

import { MarkdownAnswer } from '@/components/answer/markdown-answer';
import { PdfViewer, type ViewerState } from '@/components/documents/pdf-viewer';
import { StatusBadge } from '@/components/documents/status-badge';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ask, documentFileUrl, getDocument } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { useApiErrorHandler } from '@/lib/use-api-error';
import {
  AskRequestSchema,
  NOT_FOUND_SINGLE,
  QUESTION_MAX_LENGTH,
  type AskResponse,
} from '@repo/contracts';

import { NotFoundCallout, TruncatedWarning } from './answer-notices';
import { CopyButton } from './copy-button';
import { PendingAnswer } from './pending-answer';

const QuestionSchema = AskRequestSchema.pick({ question: true });
type QuestionInput = z.input<typeof QuestionSchema>;

/** Moves focus to a newly rendered answer, so keyboard and screen-reader users land on it. */
function focusOnMount(element: HTMLElement | null): void {
  element?.focus();
}

interface Turn {
  id: string;
  question: string;
  response: AskResponse;
}

/** Wide enough to show the PDF next to the thread (Tailwind's lg breakpoint). */
const SIDE_BY_SIDE = '(min-width: 64rem)';

function subscribeToWidth(onChange: () => void): () => void {
  const query = window.matchMedia(SIDE_BY_SIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the screen is wide enough for side by side; false while rendering on the server. */
function useSideBySide(): boolean {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(SIDE_BY_SIDE).matches,
    () => false,
  );
}

/**
 * Q&A over one document, with the original PDF alongside when it is stored. The PDF opens at
 * `initialPage` when given, and otherwise by default on wide screens. The thread lives in client
 * state only and is never persisted or logged.
 */
export function AskView({ documentId, initialPage }: { documentId: string; initialPage?: number }) {
  const handleError = useApiErrorHandler();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [controller, setController] = useState<AbortController | null>(null);
  // 'auto' until the user opens or closes the PDF themselves.
  const [chosenViewer, setViewer] = useState<ViewerState | null | 'auto'>('auto');
  const sideBySide = useSideBySide();

  const document = useQuery({
    queryKey: queryKeys.documents.detail(documentId),
    queryFn: ({ signal }) => getDocument(documentId, signal),
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 3000 : false),
  });

  const form = useForm<QuestionInput>({
    resolver: zodResolver(QuestionSchema),
    defaultValues: { question: '' },
  });

  const question = useMutation({
    mutationFn: ({ text, signal }: { text: string; signal: AbortSignal }) =>
      ask({ documentId, question: text }, signal),
    onSuccess: (response, { text }) => {
      setTurns((previous) => [...previous, { id: crypto.randomUUID(), question: text, response }]);
      form.reset({ question: '' });
    },
    onError: (error) => handleError(error),
  });

  useEffect(() => {
    if (document.error) handleError(document.error);
  }, [document.error, handleError]);

  const hasFile = document.data?.hasFile ?? false;
  const viewer =
    chosenViewer !== 'auto'
      ? chosenViewer
      : hasFile && (initialPage || sideBySide)
        ? { page: initialPage ?? 1, key: 0 }
        : null;
  const showPage = (page: number) => setViewer({ page, key: (viewer?.key ?? 0) + 1 });
  const hideViewer = () => setViewer(null);

  const onSubmit = form.handleSubmit(({ question: text }) => {
    const next = new AbortController();
    setController(next);
    question.mutate({ text: text.trim(), signal: next.signal });
  });

  if (document.isPending) return <Skeleton className="h-28 w-full" />;
  if (document.error || !document.data) {
    return (
      <div className="space-y-3">
        <ErrorMessage error={document.error} />
        <Link className="text-sm underline" href="/documents">
          Back to documents
        </Link>
      </div>
    );
  }

  const doc = document.data;
  const questionError = form.formState.errors.question?.message;

  return (
    <div
      data-wide={viewer ? '' : undefined}
      className={
        viewer ? 'grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start' : undefined
      }
    >
      <div className="min-w-0 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold break-words">{doc.filename}</h1>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={doc.status} />
              {doc.pageCount ? `${doc.pageCount} pages` : null}
            </p>
          </div>
          {doc.hasFile ? (
            <Button
              variant="outline"
              onClick={() => (viewer ? hideViewer() : showPage(1))}
              aria-pressed={viewer !== null}
            >
              <FileText aria-hidden />
              {viewer ? 'Hide document' : 'View document'}
            </Button>
          ) : null}
        </header>

        <ol className="space-y-6" aria-label="Questions and answers">
          {turns.map((turn, index) => {
            const notFound = turn.response.answer.trim() === NOT_FOUND_SINGLE;
            return (
              <li key={turn.id} className="space-y-3">
                <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium">{turn.question}</p>
                <article
                  ref={index === turns.length - 1 ? focusOnMount : undefined}
                  tabIndex={-1}
                  aria-label="Answer"
                  className="space-y-3 rounded-md border p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {notFound ? (
                    <NotFoundCallout sentence={NOT_FOUND_SINGLE} />
                  ) : (
                    <MarkdownAnswer
                      markdown={turn.response.answer}
                      sources={{
                        single: turn.response.sources,
                        labels: { single: doc.filename },
                        ...(doc.hasFile
                          ? {
                              pdf: {
                                single: (page: number) => ({
                                  href: documentFileUrl(documentId, page),
                                  show: () => showPage(page),
                                }),
                              },
                            }
                          : {}),
                      }}
                    />
                  )}
                  {turn.response.truncated ? <TruncatedWarning /> : null}
                  <div className="flex justify-end">
                    <CopyButton text={turn.response.answer} />
                  </div>
                </article>
              </li>
            );
          })}
        </ol>

        {question.isPending ? (
          <PendingAnswer label="Reading the contract" onCancel={() => controller?.abort()} />
        ) : null}

        {doc.status === 'ready' ? (
          <form onSubmit={onSubmit} className="space-y-2" noValidate>
            <Label htmlFor="question">Your question</Label>
            <Textarea
              id="question"
              rows={3}
              maxLength={QUESTION_MAX_LENGTH}
              placeholder="e.g. What are the termination rights and notice periods?"
              aria-invalid={questionError ? true : undefined}
              aria-describedby="question-hint"
              disabled={question.isPending}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              {...form.register('question')}
            />
            <p id="question-hint" className="text-xs text-muted-foreground">
              {questionError ?? 'Press Ctrl+Enter (⌘+Enter on Mac) to ask.'}
            </p>
            {question.error && !(question.error instanceof DOMException) ? (
              <ErrorMessage error={question.error} />
            ) : null}
            <Button type="submit" disabled={question.isPending}>
              Ask
            </Button>
          </form>
        ) : (
          <output className="block rounded-md border p-4 text-sm">
            {doc.status === 'processing'
              ? 'This document is still processing. You can ask questions once it is ready.'
              : `This document couldn't be processed${doc.error ? `: ${doc.error}` : '.'}`}
          </output>
        )}
      </div>
      {viewer ? (
        <PdfViewer
          documentId={documentId}
          filename={doc.filename}
          state={viewer}
          onClose={hideViewer}
        />
      ) : null}
    </div>
  );
}
