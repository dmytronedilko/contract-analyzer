'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CreateOrganizationForm } from '@/components/auth/create-organization-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { authClient } from '@/lib/auth-client';

/** Select value of the "create" entry; organization ids never look like this. */
const CREATE = '__create__';

/**
 * Switches the session's active organization; every query is scoped to it, so caches reset.
 * Users allowed to create organizations also get a "Create organization" entry.
 */
export function OrganizationSwitcher({
  activeId,
  organizations,
  canCreate,
}: {
  activeId: string;
  organizations: Array<{ id: string; name: string }>;
  canCreate: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);

  async function switchTo(organizationId: string) {
    if (organizationId === CREATE) {
      setCreating(true);
      return;
    }
    if (organizationId === activeId) return;
    setPending(true);
    const { error } = await authClient.organization.setActive({ organizationId });
    setPending(false);
    if (error) return;
    queryClient.clear();
    router.replace('/documents');
    router.refresh();
  }

  return (
    <>
      <Select value={activeId} onValueChange={(value) => void switchTo(value)} disabled={pending}>
        <SelectTrigger size="sm" className="w-48" aria-label="Organization">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {organizations.map((organization) => (
            <SelectItem key={organization.id} value={organization.id}>
              {organization.name}
            </SelectItem>
          ))}
          {canCreate ? (
            <>
              <SelectSeparator />
              <SelectItem value={CREATE}>Create organization…</SelectItem>
            </>
          ) : null}
        </SelectContent>
      </Select>

      {canCreate ? (
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create an organization</DialogTitle>
              <DialogDescription>
                You&apos;ll be its owner and can invite your team. It becomes your active
                organization.
              </DialogDescription>
            </DialogHeader>
            <CreateOrganizationForm
              onCreated={() => {
                setCreating(false);
                queryClient.clear();
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
