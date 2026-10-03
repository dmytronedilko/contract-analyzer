import type { Metadata } from 'next';

import { CompareView } from '@/components/analysis/compare-view';
import { requireMember } from '@/lib/membership';

export const metadata: Metadata = { title: 'Compare' };

export default async function ComparePage() {
  await requireMember('/compare');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compare contracts</h1>
        <p className="text-sm text-muted-foreground">
          Compare two ready documents on a topic, such as termination or liability.
        </p>
      </div>
      <CompareView />
    </div>
  );
}
