import type { Metadata } from 'next';

import { AuditLogView } from '@/components/settings/audit-log-view';
import { NoPermission } from '@/components/settings/no-permission';
import { requireMember } from '@/lib/membership';
import { can } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AuditPage() {
  const member = await requireMember('/settings/audit');
  if (!can(member.role, 'audit:read')) return <NoPermission />;
  return <AuditLogView />;
}
