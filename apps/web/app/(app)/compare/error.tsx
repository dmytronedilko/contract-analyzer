'use client';

import { RouteError } from '@/components/route-error';

export default function CompareError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RouteError {...props} />;
}
