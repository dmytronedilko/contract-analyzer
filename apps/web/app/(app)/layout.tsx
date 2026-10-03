import type { ReactNode } from 'react';

import { AppHeader } from '@/components/layout/app-header';
import { DisclaimerFooter } from '@/components/layout/disclaimer-footer';
import { requireMember } from '@/lib/membership';

export const dynamic = 'force-dynamic';

/**
 * Every page in (app) requires a session and an active organization. The check runs here and in
 * each page (with the page's own path as returnTo); requireMember is cached per request. Route
 * handlers check the session themselves; proxy.ts is not used for auth.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = await requireMember('/documents');
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader member={member} />
      {/* A page that marks an element data-wide (the Ask page with its PDF open) gets the full width. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 has-data-wide:max-w-none">
        {children}
      </main>
      <DisclaimerFooter />
    </div>
  );
}
