'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Analysis takes 10-60 s: show progress with elapsed time and a way out. */
export function PendingAnswer({ onCancel, label }: { onCancel: () => void; label: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-3 rounded-md border p-4" aria-busy="true">
      <div className="flex items-center justify-between gap-2">
        <output className="text-sm text-muted-foreground">
          {label}… {elapsed}s
        </output>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
