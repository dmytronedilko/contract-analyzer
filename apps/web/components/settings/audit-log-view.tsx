'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listAuditEvents } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { useApiErrorHandler } from '@/lib/use-api-error';
import { AUDIT_ACTIONS, type AuditAction } from '@repo/contracts';

const PAGE_SIZE = 50;
const ALL = 'all';
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

export function AuditLogView() {
  const handleError = useApiErrorHandler();
  const [action, setAction] = useState<AuditAction | undefined>();
  const [offset, setOffset] = useState(0);
  const query = { limit: PAGE_SIZE, offset, action };

  const events = useQuery({
    queryKey: queryKeys.auditEvents.list(query),
    queryFn: ({ signal }) => listAuditEvents(query, signal),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (events.error) handleError(events.error);
  }, [events.error, handleError]);

  const total = events.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <Select
            value={action ?? ALL}
            onValueChange={(value) => {
              setAction(isAuditAction(value) ? value : undefined);
              setOffset(0);
            }}
          >
            <SelectTrigger id="audit-action" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {AUDIT_ACTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {events.error ? <ErrorMessage error={events.error} /> : null}
      {events.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : events.data?.items.length ? (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.data.items.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap">
                    <time dateTime={event.createdAt}>
                      {dateFormat.format(new Date(event.createdAt))}
                    </time>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.action}</TableCell>
                  <TableCell>{event.actor?.name ?? 'Deleted user'}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {event.targetType ? `${event.targetType}:${event.targetId ?? ''}` : '–'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {Object.entries(event.metadata)
                      .map(([key, value]) => `${key}=${String(value)}`)
                      .join(' ') || '–'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.requestId ?? '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No events.</p>
      )}

      {total > PAGE_SIZE ? (
        <nav aria-label="Pagination" className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
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
    </div>
  );
}
