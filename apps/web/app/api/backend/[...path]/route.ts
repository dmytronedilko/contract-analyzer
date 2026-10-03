import { auth } from '@/lib/auth';
import { proxyToBackend, type ProxyDependencies } from '@/lib/backend-proxy';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dependencies(): ProxyDependencies {
  const env = serverEnv();
  return {
    backendUrl: env.BACKEND_URL,
    appUrl: env.APP_URL,
    getSession: async (headers) => {
      const session = await auth().api.getSession({ headers });
      return session
        ? { activeOrganizationId: session.session.activeOrganizationId ?? null }
        : null;
    },
    // Mints a 5-minute JWT for the session with Better Auth's JWT plugin.
    getToken: async (headers) => (await auth().api.getToken({ headers })).token,
    fetch,
  };
}

async function handle(
  request: Request,
  { params }: RouteContext<'/api/backend/[...path]'>,
): Promise<Response> {
  const { path } = await params;
  return proxyToBackend(request, path, dependencies());
}

export { handle as GET, handle as POST, handle as DELETE };
