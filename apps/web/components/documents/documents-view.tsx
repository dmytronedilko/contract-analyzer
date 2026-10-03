'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { Role } from '@repo/contracts';

import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listDocuments } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { can } from '@/lib/permissions';
import { useApiErrorHandler } from '@/lib/use-api-error';

import { DocumentsTable } from './documents-table';
import { UploadDropzone } from './upload-dropzone';

const PAGE_SIZE = 20;

export function DocumentsView({ role, userId }: { role: Role; userId: string }) {
  const [offset, setOffset] = useState(0);
  const handleError = useApiErrorHandler();
  const query = { limit: PAGE_SIZE, offset };

  const documents = useQuery({
    queryKey: queryKeys.documents.list(query),
    queryFn: ({ signal }) => listDocuments(query, signal),
    placeholderData: keepPreviousData,
    // Poll while anything is still processing; stop as soon as nothing is.
    refetchInterval: (current) =>
      current.state.data?.items.some((document) => document.status === 'processing') ? 3000 : false,
  });

  useEffect(() => {
    if (documents.error) handleError(documents.error);
  }, [documents.error, handleError]);

  const total = documents.data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {can(role, 'document:upload') ? <UploadDropzone /> : null}

      {documents.error ? <ErrorMessage error={documents.error} /> : null}
      {documents.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : documents.data ? (
        <>
          <DocumentsTable documents={documents.data.items} role={role} userId={userId} />
          {total > PAGE_SIZE ? (
            <nav aria-label="Pagination" className="flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
