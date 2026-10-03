import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import type { Role } from '@repo/contracts';

import { auth } from './auth';
import { parseRole } from './permissions';
import { signInUrl } from './return-to';

export interface CurrentMember {
  user: { id: string; name: string; email: string; image: string | null };
  organization: { id: string; name: string };
  organizations: Array<{ id: string; name: string }>;
  role: Role;
}

type MemberResult =
  | { kind: 'signed-out' }
  | { kind: 'no-organization' }
  | { kind: 'member'; member: CurrentMember };

/** Loads the caller once per request (React cache), shared by the (app) layout and its pages. */
const loadMember = cache(async (): Promise<MemberResult> => {
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return { kind: 'signed-out' };

  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) return { kind: 'no-organization' };

  const [member, organizations] = await Promise.all([
    auth()
      .api.getActiveMember({ headers: requestHeaders })
      .catch(() => null),
    auth().api.listOrganizations({ headers: requestHeaders }),
  ]);
  const role = parseRole(member?.role);
  const organization = organizations.find((org) => org.id === organizationId);
  if (!role || !organization) return { kind: 'no-organization' };

  return {
    kind: 'member',
    member: {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
      },
      organization: { id: organization.id, name: organization.name },
      organizations: organizations.map(({ id, name }) => ({ id, name })),
      role,
    },
  };
});

/**
 * The signed-in user in their active organization. Redirects to /sign-in (returning to
 * `returnTo`) without a session, and to /onboarding without an active organization or membership.
 */
export async function requireMember(returnTo: string): Promise<CurrentMember> {
  const result = await loadMember();
  if (result.kind === 'signed-out') redirect(signInUrl(returnTo));
  if (result.kind === 'no-organization') redirect('/onboarding');
  return result.member;
}
