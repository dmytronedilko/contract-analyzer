'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

const CreateOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters').max(100),
});
type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

/** A URL-safe slug from the name, with a random suffix so names don't have to be unique. */
function slugFor(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Creates an organization owned by the user and switches to it; `onCreated` runs first. */
export function CreateOrganizationForm({ onCreated }: { onCreated?: () => void } = {}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(CreateOrganizationSchema),
    defaultValues: { name: '' },
  });

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setError(null);
    // Creating an organization makes it the session's active organization.
    const result = await authClient.organization.create({ name, slug: slugFor(name) });
    if (result.error) {
      setError(result.error.message ?? 'The organization could not be created.');
      return;
    }
    onCreated?.();
    router.replace('/documents');
    router.refresh();
  });

  const nameError = form.formState.errors.name?.message;
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="organization-name">Organization name</Label>
        <Input
          id="organization-name"
          autoComplete="organization"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'organization-name-error' : undefined}
          {...form.register('name')}
        />
        {nameError ? (
          <p id="organization-name-error" className="text-sm text-destructive">
            {nameError}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Creating…' : 'Create organization'}
      </Button>
    </form>
  );
}
