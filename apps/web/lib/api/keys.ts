import type { ListAuditEventsQuery, ListDocumentsQuery } from '@repo/contracts';

/** TanStack Query keys. Mutations invalidate `documents.all`. */
export const queryKeys = {
  documents: {
    all: ['documents'] as const,
    list: (query: ListDocumentsQuery) => ['documents', 'list', query] as const,
    detail: (id: string) => ['documents', 'detail', id] as const,
    ready: ['documents', 'ready'] as const,
  },
  auditEvents: {
    all: ['audit-events'] as const,
    list: (query: ListAuditEventsQuery) => ['audit-events', 'list', query] as const,
  },
};
