import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public health endpoint for container healthchecks and the CI smoke test: 200 when the API
 * reports ready (its database answers), 503 otherwise. Reveals nothing beyond the status.
 */
export async function GET(): Promise<Response> {
  let ready = false;
  try {
    const response = await fetch(new URL('/health/ready', serverEnv().BACKEND_URL), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    ready = response.ok;
  } catch {
    ready = false;
  }
  return Response.json(
    { status: ready ? 'ok' : 'unavailable' },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
