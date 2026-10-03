/**
 * A same-site path to return to after signing in. Anything else (absolute URLs, protocol-relative
 * `//host`, backslash tricks) falls back to /documents, so the parameter can't be used as an open
 * redirect.
 */
export function safeReturnTo(value: string | string[] | null | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return '/documents';
  }
  return path;
}

export function signInUrl(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}
