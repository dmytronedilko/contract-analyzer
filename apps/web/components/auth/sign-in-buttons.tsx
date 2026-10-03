'use client';

import { useState } from 'react';

import type { IdentityProvider } from '@/lib/auth';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export function SignInButtons({
  providers,
  returnTo,
}: {
  providers: IdentityProvider[];
  returnTo: string;
}) {
  const [pending, setPending] = useState<string | null>(null);

  async function signIn(provider: string) {
    setPending(provider);
    // Redirects to the identity provider; failures come back to /sign-in?error=...
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: returnTo,
      errorCallbackURL: '/sign-in',
    });
    if (error) setPending(null);
  }

  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider) => (
        <Button
          key={provider.id}
          variant="outline"
          disabled={pending !== null}
          onClick={() => signIn(provider.id)}
        >
          {pending === provider.id ? 'Redirecting…' : `Continue with ${provider.name}`}
        </Button>
      ))}
    </div>
  );
}
