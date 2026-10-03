import type { Metadata } from 'next';

import { headers } from 'next/headers';
import Link from 'next/link';

import { InvitationActions } from '@/components/auth/invitation-actions';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/auth';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Invitation' };
export const dynamic = 'force-dynamic';

/**
 * The target of an invite link. Accepting requires being signed in with the invited email
 * address; Better Auth refuses the invitation for anyone else.
 */
export default async function InvitationPage({ params }: PageProps<'/invite/[id]'>) {
  const { id } = await params;
  const session = await requireSession(`/invite/${encodeURIComponent(id)}`);

  const invitation = await auth()
    .api.getInvitation({ query: { id }, headers: await headers() })
    .catch(() => null);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        {invitation ? (
          <>
            <CardHeader>
              <CardTitle>Join {invitation.organizationName}</CardTitle>
              <CardDescription>
                You&apos;ve been invited as <Badge variant="secondary">{invitation.role}</Badge>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InvitationActions
                invitationId={invitation.id}
                organizationId={invitation.organizationId}
              />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Invitation unavailable</CardTitle>
              <CardDescription>
                This invitation doesn&apos;t exist, has expired or was already used, or it was sent
                to a different email address than {session.user.email}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link className="text-sm underline" href="/onboarding">
                Back
              </Link>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
