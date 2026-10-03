import type { Metadata } from 'next';

import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CreateOrganizationForm } from '@/components/auth/create-organization-form';
import { OrganizationPicker } from '@/components/auth/organization-picker';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth, canCreateOrganization } from '@/lib/auth';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Get started' };
export const dynamic = 'force-dynamic';

/**
 * Where users without an active organization land: open one of their organizations, accept a
 * pending invitation, or create an organization when allowed.
 */
export default async function OnboardingPage() {
  const session = await requireSession('/onboarding');
  if (session.session.activeOrganizationId) redirect('/documents');

  const requestHeaders = await headers();
  const [organizations, invitations] = await Promise.all([
    auth().api.listOrganizations({ headers: requestHeaders }),
    auth().api.listUserInvitations({ headers: requestHeaders }),
  ]);
  const pending = invitations.filter(
    (invitation) => invitation.status === 'pending' && new Date(invitation.expiresAt) > new Date(),
  );
  const mayCreate = canCreateOrganization(session.user.email);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Welcome, {session.user.name}</h1>

      {organizations.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Your organizations</CardTitle>
            <CardDescription>Choose where to work.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationPicker
              organizations={organizations.map(({ id, name }) => ({ id, name }))}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>
            Invitations sent to {session.user.email}. Ask an admin for an invite link if you
            expected one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length ? (
            <ul className="space-y-2">
              {pending.map((invitation) => (
                <li key={invitation.id} className="flex items-center justify-between gap-2">
                  <span>
                    {invitation.organizationName}{' '}
                    <Badge variant="secondary">{invitation.role}</Badge>
                  </span>
                  <Link className="text-sm underline" href={`/invite/${invitation.id}`}>
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          )}
        </CardContent>
      </Card>

      {mayCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Create an organization</CardTitle>
            <CardDescription>You&apos;ll be its owner and can invite your team.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOrganizationForm />
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
