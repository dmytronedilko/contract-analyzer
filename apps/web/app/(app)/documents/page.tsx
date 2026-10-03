import type { Metadata } from 'next';

import { DocumentsView } from '@/components/documents/documents-view';
import { requireMember } from '@/lib/membership';

export const metadata: Metadata = { title: 'Documents' };

export default async function DocumentsPage() {
  const member = await requireMember('/documents');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Contracts uploaded to {member.organization.name}.
        </p>
      </div>
      <DocumentsView role={member.role} userId={member.user.id} />
    </div>
  );
}
