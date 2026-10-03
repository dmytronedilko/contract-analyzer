'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Info } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import type { Document, Role } from '@repo/contracts';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { deleteDocument } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { canDeleteDocument } from '@/lib/permissions';
import { useApiErrorHandler } from '@/lib/use-api-error';

import { StatusBadge } from './status-badge';

/** The document's page; with `view`, its PDF opens at the first page. */
function documentHref(document: Document, { view }: { view: boolean }): string {
  return `/documents/${document.id}${view ? '?page=1' : ''}`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function DocumentsTable({
  documents,
  role,
  userId,
}: {
  documents: Document[];
  role: Role;
  userId: string;
}) {
  if (!documents.length) {
    return <p className="text-sm text-muted-foreground">No documents yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead className="text-right">Pages</TableHead>
            <TableHead className="text-right">Chunks</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id}>
              <TableCell className="max-w-72 truncate font-medium" title={document.filename}>
                {document.hasFile || document.status === 'ready' ? (
                  <Link
                    className="hover:underline"
                    href={documentHref(document, { view: document.hasFile })}
                  >
                    {document.filename}
                  </Link>
                ) : (
                  document.filename
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{document.pageCount ?? '–'}</TableCell>
              <TableCell className="text-right tabular-nums">{document.chunkCount}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1">
                  <StatusBadge status={document.status} />
                  {document.status === 'failed' && document.error ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Why it failed" className="rounded-sm">
                          <Info className="size-4 text-muted-foreground" aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">{document.error}</TooltipContent>
                    </Tooltip>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <time dateTime={document.createdAt}>
                  {dateFormat.format(new Date(document.createdAt))}
                </time>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  {document.hasFile ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={documentHref(document, { view: true })}>
                        <FileText aria-hidden />
                        View
                      </Link>
                    </Button>
                  ) : null}
                  {document.status === 'ready' ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/documents/${document.id}`}>Ask</Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      Ask
                    </Button>
                  )}
                  {canDeleteDocument(role, userId, document.uploadedBy) ? (
                    <DeleteDocumentButton document={document} />
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DeleteDocumentButton({ document }: { document: Document }) {
  const queryClient = useQueryClient();
  const handleError = useApiErrorHandler();
  const remove = useMutation({
    mutationFn: () => deleteDocument(document.id),
    onSuccess: () => toast.success('Document deleted'),
    onError: (error) => handleError(error, { notify: true }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all }),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={remove.isPending}>
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this document?</AlertDialogTitle>
          <AlertDialogDescription>
            “{document.filename}” and its indexed excerpts will be removed for everyone in the
            organization. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
