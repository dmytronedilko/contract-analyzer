'use client';

import { Button } from '@/components/ui/button';

/** Shared body of the error.tsx boundaries: no details, the digest as a reference, a retry. */
export function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div role="alert" className="space-y-3 rounded-md border p-6">
      <h2 className="font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        The page couldn&apos;t be loaded. Try again in a moment.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
