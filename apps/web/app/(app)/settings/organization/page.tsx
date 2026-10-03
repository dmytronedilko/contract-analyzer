import type { Metadata } from 'next';

import { headers } from 'next/headers';

import { NoPermission } from '@/components/settings/no-permission';
import { OrganizationSettings } from '@/components/settings/organization-settings';
import { auth } from '@/lib/auth';
import { serverEnv } from '@/lib/env';
import { requireMember } from '@/lib/membership';
import { can, parseRole } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Organization settings' };

export default async function OrganizationSettingsPage() {
  const member = await requireMember('/settings/organization');
  if (!can(member.role, 'member:manage')) return <NoPermission />;

  const organization = await auth().api.getFullOrganization({ headers: await headers() });
  if (!organization) return <NoPermission />;

  const now = new Date();
  return (
    <OrganizationSettings
      organization={{ id: organization.id, name: organization.name }}
      currentUserId={member.user.id}
      currentRole={member.role}
      appUrl={serverEnv().APP_URL}
      members={organization.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: parseRole(m.role) ?? 'viewer',
      }))}
      invitations={organization.invitations
        .filter((invitation) => invitation.status === 'pending' && invitation.expiresAt > now)
        .map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: parseRole(invitation.role) ?? 'viewer',
          expiresAt: invitation.expiresAt.toISOString(),
        }))}
    />
  );
}
