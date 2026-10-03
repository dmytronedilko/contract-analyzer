import type { DocumentStatus } from '@repo/contracts';

import { Badge } from '@/components/ui/badge';

const LABELS: Record<DocumentStatus, string> = {
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

const VARIANTS = {
  processing: 'secondary',
  ready: 'default',
  failed: 'destructive',
} as const satisfies Record<DocumentStatus, 'secondary' | 'default' | 'destructive'>;

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
