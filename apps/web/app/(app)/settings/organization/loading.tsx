import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return <Skeleton className="h-64 w-full" aria-busy="true" aria-label="Loading" />;
}
