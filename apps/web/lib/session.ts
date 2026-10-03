import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from './auth';
import { signInUrl } from './return-to';

export type Session = NonNullable<
  Awaited<ReturnType<ReturnType<typeof auth>['api']['getSession']>>
>;

/** The current session from the request cookies, validated against the database. */
export async function getSession(): Promise<Session | null> {
  return auth().api.getSession({ headers: await headers() });
}

/** The session, or a redirect to /sign-in that returns to `returnTo` afterwards. */
export async function requireSession(returnTo: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(signInUrl(returnTo));
  return session;
}
