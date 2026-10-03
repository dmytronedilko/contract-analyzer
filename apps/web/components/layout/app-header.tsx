import Link from 'next/link';

import type { CurrentMember } from '@/lib/membership';

import { canCreateOrganization } from '@/lib/auth';
import { can } from '@/lib/permissions';

import { OrganizationSwitcher } from './organization-switcher';
import { UserMenu } from './user-menu';

export function AppHeader({ member }: { member: CurrentMember }) {
  const showSettings = can(member.role, 'member:manage') || can(member.role, 'audit:read');
  return (
    <header className="border-b">
      {/* Widens with the page when it shows a document side by side (data-wide). */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 [body:has([data-wide])_&]:max-w-none">
        <Link href="/documents" className="font-semibold">
          Contract Analyzer
        </Link>
        <nav aria-label="Main" className="flex gap-4 text-sm">
          <Link href="/documents" className="hover:underline">
            Documents
          </Link>
          <Link href="/compare" className="hover:underline">
            Compare
          </Link>
          {showSettings ? (
            <Link href="/settings/organization" className="hover:underline">
              Settings
            </Link>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <OrganizationSwitcher
            activeId={member.organization.id}
            organizations={member.organizations}
            canCreate={canCreateOrganization(member.user.email)}
          />
          <UserMenu name={member.user.name} email={member.user.email} />
        </div>
      </div>
    </header>
  );
}
