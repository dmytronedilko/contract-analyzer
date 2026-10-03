'use client';

import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { referenceLine } from '@/lib/use-api-error';

/** An inline error with its reference id, for forms and failed queries. */
export function ErrorMessage({ error, title }: { error: unknown; title?: string }) {
  const reference = referenceLine(error);
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>
        <p>{error instanceof Error ? error.message : 'Something went wrong.'}</p>
        {reference ? <p className="font-mono text-xs">{reference}</p> : null}
      </AlertDescription>
    </Alert>
  );
}
