import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';

import { randomUUID } from 'node:crypto';

import { ERROR_CODES, REQUEST_ID_HEADER, type ApiErrorBody } from '@repo/contracts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CORS_METHODS = ['GET', 'POST', 'DELETE'];
export const CORS_ALLOWED_HEADERS = ['authorization', 'content-type', 'accept', REQUEST_ID_HEADER];
export const CORS_MAX_AGE_SECONDS = 600;

export interface HttpPolicyOptions {
  /** Exact origins allowed to call the API from a browser. Empty: CORS disabled. */
  corsOrigins: readonly string[];
}

/** The request id set by the onRequest hook (always a UUID). */
export function requestIdOf(request: FastifyRequest): string {
  const value = request.headers[REQUEST_ID_HEADER];
  return typeof value === 'string' ? value : '';
}

const originNotAllowed: ApiErrorBody = {
  statusCode: 403,
  message: 'Origin not allowed',
  error: 'Forbidden',
  errorCode: ERROR_CODES.ORIGIN_NOT_ALLOWED,
};

/**
 * Registers, in this order:
 * 1. A request-id hook: keeps an incoming x-request-id when it's a UUID (the web proxy sends one)
 *    and otherwise replaces it with a new UUID. It runs before Observe reads the header, so the id
 *    becomes the trace id. An onSend hook echoes it on every response, errors included.
 * 2. An origin guard that rejects any request whose Origin isn't allowlisted with 403
 *    ORIGIN_NOT_ALLOWED; with CORS disabled, that's every request carrying an Origin. Requests
 *    without Origin (the web server, health checks, curl) pass. CORS alone wouldn't be enough:
 *    a cross-site multipart POST needs no preflight and would still run; CORS only hides the
 *    response from the page.
 * 3. CORS, only when origins are configured: exact string matching, bearer tokens only (no
 *    credentials), and Vary: Origin.
 */
export function registerHttpPolicy(app: NestFastifyApplication, options: HttpPolicyOptions): void {
  const fastify = app.getHttpAdapter().getInstance();
  const allowed = new Set(options.corsOrigins);

  fastify.addHook('onRequest', async (request) => {
    const incoming = request.headers[REQUEST_ID_HEADER];
    if (typeof incoming !== 'string' || !UUID.test(incoming)) {
      request.headers[REQUEST_ID_HEADER] = randomUUID();
    }
  });

  fastify.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    // Returning the reply from an async hook ends the request after send().
    return origin !== undefined && !allowed.has(origin)
      ? reply.code(403).send(originNotAllowed)
      : undefined;
  });

  fastify.addHook('onSend', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, requestIdOf(request));
  });

  if (allowed.size) {
    app.enableCors({
      origin: [...allowed],
      methods: CORS_METHODS,
      allowedHeaders: CORS_ALLOWED_HEADERS,
      exposedHeaders: [REQUEST_ID_HEADER],
      credentials: false,
      maxAge: CORS_MAX_AGE_SECONDS,
    });
  }
}
