import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { SignInButtons } from '@/components/auth/sign-in-buttons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { configuredProviders, SIGN_IN_ERRORS } from '@/lib/auth';
import { safeReturnTo } from '@/lib/return-to';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  [SIGN_IN_ERRORS.emailNotVerified]:
    "Your identity provider didn't confirm your email address, so you can't sign in. Ask your administrator to verify it.",
  [SIGN_IN_ERRORS.domainNotAllowed]:
    "Accounts from your email domain aren't allowed to use this application.",
  account_not_linked:
    'This email is already used by another sign-in method. Use the provider you signed in with before.',
};

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  if (await getSession()) redirect(returnTo);

  const error = typeof params.error === 'string' ? params.error : undefined;
  const providers = configuredProviders();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Contract Analyzer</CardTitle>
        <CardDescription>Sign in with your organization&apos;s account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {ERROR_MESSAGES[error] ?? 'Sign-in failed. Try again or contact your administrator.'}
            </AlertDescription>
          </Alert>
        ) : null}
        {providers.length ? (
          <SignInButtons providers={providers} returnTo={returnTo} />
        ) : (
          <p className="text-sm text-muted-foreground">No identity provider is configured.</p>
        )}
      </CardContent>
    </Card>
  );
}
