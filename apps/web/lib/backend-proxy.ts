import { ERROR_CODES, REQUEST_ID_HEADER, type ApiErrorBody, type ErrorCode } from '@repo/contracts';

/** First path segments the browser may reach on the API. Everything else is 404. */
export const ALLOWED_PREFIXES = new Set(['documents', 'analysis', 'audit-events']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT = /^[A-Za-z0-9_-]+$/;

/** Request headers forwarded upstream; cookie, host, origin and hop-by-hop headers never are. */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept'];
/** Response headers passed back to the browser. */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'retry-after',
  'www-authenticate',
  'content-disposition',
  'x-content-type-options',
];

export interface ProxyDependencies {
  backendUrl: string;
  appUrl: string;
  /** The caller's session (validated server-side), or null. */
  getSession(headers: Headers): Promise<{ activeOrganizationId: string | null } | null>;
  /** A short-lived API token for that session. */
  getToken(headers: Headers): Promise<string>;
  fetch: typeof fetch;
}

function errorResponse(
  statusCode: number,
  error: string,
  message: string,
  requestId: string,
  errorCode?: ErrorCode,
): Response {
  const body: ApiErrorBody = { statusCode, message, error, ...(errorCode ? { errorCode } : {}) };
  return Response.json(body, {
    status: statusCode,
    headers: { [REQUEST_ID_HEADER]: requestId, 'cache-control': 'no-store' },
  });
}

/**
 * Same-origin policy for the proxy: browsers send Sec-Fetch-Site, and anything other than
 * same-origin or none (typed URL, bookmark) is another site making the visitor's browser call us.
 * Without that header (non-browser clients, old browsers), a state-changing request must not carry
 * a foreign Origin. This keeps other sites from triggering uploads or AI calls with the visitor's
 * session cookie.
 */
export function isCrossSite(request: Request, appUrl: string): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site !== 'same-origin' && site !== 'none';
  if (request.method === 'GET' || request.method === 'HEAD') return false;
  const origin = request.headers.get('origin');
  return origin !== null && origin !== new URL(appUrl).origin;
}

/**
 * Forwards an allowlisted browser request to the API server-to-server, authenticated with a
 * freshly minted bearer token instead of the session cookie. The body is streamed through, and a
 * cancelled browser request cancels the upstream call.
 */
export async function proxyToBackend(
  request: Request,
  segments: readonly string[],
  deps: ProxyDependencies,
): Promise<Response> {
  const incomingId = request.headers.get(REQUEST_ID_HEADER);
  const requestId = incomingId && UUID.test(incomingId) ? incomingId : crypto.randomUUID();

  if (isCrossSite(request, deps.appUrl)) {
    return errorResponse(
      403,
      'Forbidden',
      'Cross-site requests are not allowed',
      requestId,
      ERROR_CODES.ORIGIN_NOT_ALLOWED,
    );
  }

  const [prefix] = segments;
  if (!prefix || !ALLOWED_PREFIXES.has(prefix) || !segments.every((s) => SEGMENT.test(s))) {
    return errorResponse(404, 'Not Found', 'Not found', requestId);
  }

  const session = await deps.getSession(request.headers);
  if (!session) {
    return errorResponse(
      401,
      'Unauthorized',
      'Authentication required',
      requestId,
      ERROR_CODES.UNAUTHENTICATED,
    );
  }
  if (!session.activeOrganizationId) {
    return errorResponse(
      403,
      'Forbidden',
      'Choose an organization first',
      requestId,
      ERROR_CODES.NO_ACTIVE_ORGANIZATION,
    );
  }

  const token = await deps.getToken(request.headers);
  const upstreamHeaders = new Headers({
    authorization: `Bearer ${token}`,
    [REQUEST_ID_HEADER]: requestId,
  });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) upstreamHeaders.set(name, value);
  }

  const url = new URL(`/${segments.join('/')}`, deps.backendUrl);
  url.search = new URL(request.url).search;
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;

  let upstream: Response;
  try {
    upstream = await deps.fetch(url, {
      method: request.method,
      headers: upstreamHeaders,
      ...(hasBody ? { body: request.body, duplex: 'half' } : {}),
      signal: request.signal,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch (error) {
    if (request.signal.aborted) {
      // The browser went away; nobody reads this response.
      return new Response(null, { status: 499, headers: { [REQUEST_ID_HEADER]: requestId } });
    }
    console.error('Backend request failed', {
      requestId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return errorResponse(503, 'Service Unavailable', 'The service is unavailable', requestId);
  }

  const headers = new Headers({
    [REQUEST_ID_HEADER]: upstream.headers.get(REQUEST_ID_HEADER) ?? requestId,
  });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
