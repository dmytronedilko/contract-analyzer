import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading document">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
