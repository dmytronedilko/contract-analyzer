import type { Metadata } from 'next';

import { AskView } from '@/components/analysis/ask-view';
import { requireMember } from '@/lib/membership';

export const metadata: Metadata = { title: 'Ask' };

/** `?page=N` opens the PDF at page N, e.g. from the documents list. */
function pageParam(value: string | string[] | undefined): number | undefined {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

export default async function AskPage({ params, searchParams }: PageProps<'/documents/[id]'>) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await requireMember(`/documents/${encodeURIComponent(id)}`);
  const page = pageParam(query.page);
  return <AskView documentId={id} {...(page ? { initialPage: page } : {})} />;
}
