import { Controller, Get, Module, Post } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerHttpPolicy } from './http-policy.js';

@Controller()
class EchoController {
  @Get('echo')
  get() {
    return { ok: true };
  }

  @Post('echo')
  post() {
    return { ok: true };
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

const ALLOWED = 'https://partner.example.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function createApp(corsOrigins: string[]): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [EchoModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  registerHttpPolicy(app, { corsOrigins });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

const preflight = (origin: string) => ({
  method: 'OPTIONS' as const,
  url: '/echo',
  headers: {
    origin,
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'authorization,content-type',
  },
});

function corsHeaders(headers: Record<string, unknown>): string[] {
  return Object.keys(headers).filter(
    (name) => name.startsWith('access-control-allow') || name === 'access-control-max-age',
  );
}

describe('HTTP policy with CORS enabled', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp([ALLOWED]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers a preflight from an allowed origin with the expected CORS headers', async () => {
    const response = await app.inject(preflight(ALLOWED));
    expect(response.statusCode).toBe(204);
    expect(response.headers).toMatchObject({
      'access-control-allow-origin': ALLOWED,
      'access-control-allow-methods': 'GET, POST, DELETE',
      'access-control-allow-headers': 'authorization, content-type, accept, x-request-id',
      'access-control-max-age': '600',
      vary: expect.stringContaining('Origin'),
    });
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('exposes x-request-id to allowed origins on actual requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { origin: ALLOWED },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(response.headers['access-control-expose-headers']).toBe('x-request-id');
  });

  it.each([
    'https://evil.example.com',
    'https://partner.example.com.evil.com',
    'http://partner.example.com',
    'null',
  ])('rejects a preflight and a simple POST from %s with 403', async (origin) => {
    const pre = await app.inject(preflight(origin));
    expect(pre.statusCode).toBe(403);
    expect(pre.json()).toMatchObject({ errorCode: 'ORIGIN_NOT_ALLOWED' });
    expect(corsHeaders(pre.headers)).toEqual([]);

    // A form POST needs no preflight: it must be rejected before the handler runs.
    const post = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'a=1',
    });
    expect(post.statusCode).toBe(403);
    expect(post.json()).toMatchObject({ errorCode: 'ORIGIN_NOT_ALLOWED' });
    expect(corsHeaders(post.headers)).toEqual([]);
  });

  it('lets requests without an Origin header through', async () => {
    const response = await app.inject({ method: 'POST', url: '/echo' });
    expect(response.statusCode).toBe(201);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('HTTP policy with CORS disabled', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects any request that carries an Origin, without CORS headers', async () => {
    for (const request of [
      preflight(ALLOWED),
      { method: 'GET' as const, url: '/echo', headers: { origin: ALLOWED } },
    ]) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ errorCode: 'ORIGIN_NOT_ALLOWED' });
      expect(corsHeaders(response.headers)).toEqual([]);
    }
  });

  it('serves requests without an Origin and sends no CORS headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/echo' });
    expect(response.statusCode).toBe(200);
    expect(corsHeaders(response.headers)).toEqual([]);
    expect(response.headers['access-control-expose-headers']).toBeUndefined();
  });

  it('generates a request id when missing and echoes it', async () => {
    const response = await app.inject({ method: 'GET', url: '/echo' });
    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('keeps a valid incoming request id and replaces an invalid one', async () => {
    const id = '3f2b9c1e-7a4d-4e8b-9c0d-1e2f3a4b5c6d';
    const kept = await app.inject({ method: 'GET', url: '/echo', headers: { 'x-request-id': id } });
    expect(kept.headers['x-request-id']).toBe(id);

    const replaced = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { 'x-request-id': 'not-a-uuid\r\nx-injected: 1' },
    });
    expect(replaced.headers['x-request-id']).toMatch(UUID);
  });

  it('echoes the request id on rejected and missing routes too', async () => {
    const rejected = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { origin: ALLOWED },
    });
    expect(rejected.headers['x-request-id']).toMatch(UUID);
    const missing = await app.inject({ method: 'GET', url: '/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['x-request-id']).toMatch(UUID);
  });
});
