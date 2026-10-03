'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export function InvitationActions({
  invitationId,
  organizationId,
}: {
  invitationId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending('accept');
    setError(null);
    const result = await authClient.organization.acceptInvitation({ invitationId });
    if (result.error) {
      setPending(null);
      setError(result.error.message ?? 'The invitation could not be accepted.');
      return;
    }
    await authClient.organization.setActive({ organizationId });
    router.replace('/documents');
    router.refresh();
  }

  async function decline() {
    setPending('decline');
    setError(null);
    const result = await authClient.organization.rejectInvitation({ invitationId });
    if (result.error) {
      setPending(null);
      setError(result.error.message ?? 'The invitation could not be declined.');
      return;
    }
    router.replace('/onboarding');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={accept} disabled={pending !== null}>
          {pending === 'accept' ? 'Joining…' : 'Accept'}
        </Button>
        <Button variant="outline" onClick={decline} disabled={pending !== null}>
          {pending === 'decline' ? 'Declining…' : 'Decline'}
        </Button>
      </div>
    </div>
  );
}
