'use client';

import { ExternalLink, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { documentFileUrl } from '@/lib/api/client';

export interface ViewerState {
  page: number;
  /** Changes on every request, so asking for the same page again scrolls back to it. */
  key: number;
}

/**
 * The original PDF in the browser's own viewer, opened at a page. The iframe is remounted for each
 * request: viewers don't reliably react to a changed #page fragment.
 */
export function PdfViewer({
  documentId,
  filename,
  state,
  onClose,
}: {
  documentId: string;
  filename: string;
  state: ViewerState;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="Document"
      className="flex flex-col gap-2 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-sm font-semibold" title={filename}>
          {filename}
        </h2>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" asChild>
            <a href={documentFileUrl(documentId, state.page)} target="_blank" rel="noopener">
              <ExternalLink aria-hidden />
              New tab
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X aria-hidden />
            Close
          </Button>
        </div>
      </div>
      {/* oxlint-disable-next-line react/iframe-missing-sandbox -- browsers refuse to run their PDF
          viewer in a sandboxed frame; the frame shows a same-origin, nosniff application/pdf. */}
      <iframe
        key={state.key}
        src={documentFileUrl(documentId, state.page)}
        title={`${filename}, page ${state.page}`}
        className="h-[80dvh] w-full rounded-md border bg-muted lg:h-auto lg:flex-1"
      />
    </section>
  );
}
