'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export function OrganizationPicker({
  organizations,
}: {
  organizations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function open(organizationId: string) {
    setPending(organizationId);
    const { error } = await authClient.organization.setActive({ organizationId });
    if (error) {
      setPending(null);
      return;
    }
    router.replace('/documents');
    router.refresh();
  }

  return (
    <ul className="space-y-2">
      {organizations.map((organization) => (
        <li key={organization.id} className="flex items-center justify-between gap-2">
          <span>{organization.name}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => open(organization.id)}
          >
            {pending === organization.id ? 'Opening…' : 'Open'}
          </Button>
        </li>
      ))}
    </ul>
  );
}
