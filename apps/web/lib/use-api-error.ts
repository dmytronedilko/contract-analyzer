'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { ApiError } from './api/errors';
import { signInUrl } from './return-to';

/** "Reference: <id>", so a user can quote the request and support can find the trace. */
export function referenceLine(error: unknown): string | undefined {
  return error instanceof ApiError && error.requestId ? `Reference: ${error.requestId}` : undefined;
}

/**
 * Handles an API error the same way everywhere: redirects for UNAUTHENTICATED (to /sign-in,
 * returning here) and NO_ACTIVE_ORGANIZATION (to /onboarding); returns true when it redirected.
 * `notify` additionally shows a toast with the message and reference (used for mutations; forms
 * render inline messages instead).
 */
export function useApiErrorHandler(): (error: unknown, options?: { notify?: boolean }) => boolean {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (error: unknown, options?: { notify?: boolean }) => {
      if (error instanceof DOMException && error.name === 'AbortError') return true;
      if (error instanceof ApiError && error.redirect === 'sign-in') {
        window.location.assign(signInUrl(pathname));
        return true;
      }
      if (error instanceof ApiError && error.redirect === 'onboarding') {
        router.replace('/onboarding');
        return true;
      }
      if (options?.notify) {
        toast.error(error instanceof Error ? error.message : 'Something went wrong.', {
          description: referenceLine(error),
        });
      }
      return false;
    },
    [pathname, router],
  );
}
