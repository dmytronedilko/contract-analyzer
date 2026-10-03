import { describe, expect, it, vi } from 'vitest';

import { proxyToBackend, type ProxyDependencies } from './backend-proxy';

const APP_URL = 'https://contracts.example.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type FetchArgs = Parameters<typeof fetch>;

function setup(overrides: Partial<ProxyDependencies> = {}) {
  const upstream = vi.fn<(...args: FetchArgs) => Promise<Response>>(async () =>
    Response.json(
      { items: [], total: 0 },
      { headers: { 'x-request-id': 'from-api', 'set-cookie': 'leak=1', 'x-internal': 'secret' } },
    ),
  );
  const deps: ProxyDependencies = {
    backendUrl: 'http://api:3001',
    appUrl: APP_URL,
    getSession: async () => ({ activeOrganizationId: 'org-1' }),
    getToken: async () => 'minted-jwt',
    fetch: upstream,
    ...overrides,
  };
  return { deps, upstream };
}

function browserRequest(path: string, init: RequestInit & { site?: string } = {}): Request {
  const { site = 'same-origin', ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('sec-fetch-site', site);
  headers.set('cookie', 'better-auth.session_token=secret-session');
  return new Request(`${APP_URL}/api/backend/${path}`, { ...rest, headers });
}

const segments = (path: string) => path.split('?')[0]!.split('/');

describe('proxyToBackend: same-origin guard', () => {
  it.each(['cross-site', 'same-site'])('rejects Sec-Fetch-Site: %s with 403', async (site) => {
    const { deps, upstream } = setup();
    const response = await proxyToBackend(
      browserRequest('documents', { site }),
      ['documents'],
      deps,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ errorCode: 'ORIGIN_NOT_ALLOWED' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('accepts same-origin and none (typed URL, bookmark)', async () => {
    for (const site of ['same-origin', 'none']) {
      const { deps } = setup();
      const response = await proxyToBackend(
        browserRequest('documents', { site }),
        ['documents'],
        deps,
      );
      expect(response.status).toBe(200);
    }
  });

  it('rejects a POST with a foreign Origin when Sec-Fetch-Site is absent', async () => {
    const { deps, upstream } = setup();
    const request = new Request(`${APP_URL}/api/backend/analysis/ask`, {
      method: 'POST',
      headers: { origin: 'https://evil.example.com', 'content-type': 'application/json' },
      body: '{}',
    });
    const response = await proxyToBackend(request, ['analysis', 'ask'], deps);
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('lets non-browser clients without Sec-Fetch-Site or Origin through', async () => {
    const { deps } = setup();
    const response = await proxyToBackend(
      new Request(`${APP_URL}/api/backend/documents`),
      ['documents'],
      deps,
    );
    expect(response.status).toBe(200);
  });
});

describe('proxyToBackend: allowlist', () => {
  it.each([
    ['health'],
    ['health', 'ready'],
    [],
    ['documents', '..', 'health'],
    ['documents', '%2e%2e'],
    ['documents', 'a b'],
  ])('returns 404 for %j', async (...path) => {
    const { deps, upstream } = setup();
    const response = await proxyToBackend(browserRequest(path.join('/')), path, deps);
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(['documents', 'analysis/ask', 'audit-events'])('forwards /%s', async (path) => {
    const { deps, upstream } = setup();
    await proxyToBackend(browserRequest(path), segments(path), deps);
    expect(upstream).toHaveBeenCalledOnce();
  });
});

describe('proxyToBackend: session', () => {
  it('returns 401 UNAUTHENTICATED without a session', async () => {
    const { deps, upstream } = setup({ getSession: async () => null });
    const response = await proxyToBackend(browserRequest('documents'), ['documents'], deps);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('returns 403 NO_ACTIVE_ORGANIZATION without an active organization', async () => {
    const { deps } = setup({ getSession: async () => ({ activeOrganizationId: null }) });
    const response = await proxyToBackend(browserRequest('documents'), ['documents'], deps);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ errorCode: 'NO_ACTIVE_ORGANIZATION' });
  });
});

describe('proxyToBackend: forwarding', () => {
  it('attaches the bearer token and never forwards the cookie, host or origin', async () => {
    const { deps, upstream } = setup();
    await proxyToBackend(
      browserRequest('documents?limit=5', {
        headers: { accept: 'application/json', origin: APP_URL },
      }),
      ['documents'],
      deps,
    );
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toEqual(new URL('http://api:3001/documents?limit=5'));
    const sent = new Headers(init?.headers);
    expect(sent.get('authorization')).toBe('Bearer minted-jwt');
    expect(sent.get('accept')).toBe('application/json');
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('host')).toBeNull();
    expect(sent.get('origin')).toBeNull();
  });

  it('streams the body with its multipart content type and passes the abort signal', async () => {
    const { deps, upstream } = setup();
    const form = new FormData();
    form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'a.pdf');
    const request = browserRequest('documents/upload', { method: 'POST', body: form });
    await proxyToBackend(request, ['documents', 'upload'], deps);
    const [, init] = upstream.mock.calls[0]!;
    expect(new Headers(init?.headers).get('content-type')).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    expect(init?.body).toBeInstanceOf(ReadableStream);
    expect(init).toMatchObject({ method: 'POST', duplex: 'half', signal: request.signal });
  });

  it('keeps a valid request id and replaces an invalid one', async () => {
    const id = '3f2b9c1e-7a4d-4e8b-9c0d-1e2f3a4b5c6d';
    const { deps, upstream } = setup();
    await proxyToBackend(
      browserRequest('documents', { headers: { 'x-request-id': id } }),
      ['documents'],
      deps,
    );
    expect(new Headers(upstream.mock.calls[0]![1]?.headers).get('x-request-id')).toBe(id);

    const rejected = await proxyToBackend(
      browserRequest('health', { headers: { 'x-request-id': 'not-a-uuid' } }),
      ['health'],
      deps,
    );
    expect(rejected.headers.get('x-request-id')).toMatch(UUID);
  });

  it('returns the upstream status and body with safe headers only', async () => {
    const { deps } = setup();
    const response = await proxyToBackend(browserRequest('documents'), ['documents'], deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], total: 0 });
    expect(response.headers.get('x-request-id')).toBe('from-api');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-internal')).toBeNull();
  });

  it('passes a PDF through with its type, disposition and nosniff', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4');
    const { deps } = setup({
      fetch: async () =>
        new Response(pdf, {
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': 'inline; filename="msa.pdf"',
            'x-content-type-options': 'nosniff',
            'cache-control': 'private, no-store',
          },
        }),
    });
    const id = '0b6e8d1e-5a43-4b8e-9d0e-6c1f8a2b9c3d';
    const response = await proxyToBackend(
      browserRequest(`documents/${id}/file`),
      ['documents', id, 'file'],
      deps,
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="msa.pdf"',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    });
  });

  it('passes Retry-After through on 429', async () => {
    const { deps } = setup({
      fetch: async () =>
        Response.json(
          { statusCode: 429, errorCode: 'RATE_LIMITED' },
          { status: 429, headers: { 'retry-after': '30' } },
        ),
    });
    const response = await proxyToBackend(
      browserRequest('analysis/ask', { method: 'POST', body: '{}' }),
      ['analysis', 'ask'],
      deps,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
  });

  it('answers 503 when the API is unreachable', async () => {
    const { deps } = setup({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await proxyToBackend(browserRequest('documents'), ['documents'], deps);
    expect(response.status).toBe(503);
    expect(response.headers.get('x-request-id')).toMatch(UUID);
  });
});
