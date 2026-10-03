import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ERROR_CODES, PERMISSIONS, ROLES, ROLE_PERMISSIONS, type Role } from '@repo/contracts';

import type { Principal } from './principal.js';

import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { testEnv } from '../test/env.js';
import { TestTokens } from '../test/tokens.js';
import { AuthModule } from './auth.module.js';
import { CurrentPrincipal } from './current-principal.decorator.js';
import { MembershipService } from './membership.service.js';
import { Public } from './public.decorator.js';
import { RequirePermission } from './require-permission.decorator.js';
import { JWKS_RESOLVER } from './token-verifier.service.js';

@Controller('test')
class TestController {
  @Public()
  @Get('public')
  open() {
    return { ok: true };
  }

  @Get('undeclared')
  undeclared() {
    return { ok: true };
  }

  @RequirePermission('document:read')
  @Get('whoami')
  whoami(@CurrentPrincipal() principal: Principal) {
    return principal;
  }

  @RequirePermission('document:read')
  @Get('document-read')
  documentRead() {
    return { ok: true };
  }

  @RequirePermission('document:upload')
  @Get('document-upload')
  documentUpload() {
    return { ok: true };
  }

  @RequirePermission('document:delete:own')
  @Get('document-delete-own')
  documentDeleteOwn() {
    return { ok: true };
  }

  @RequirePermission('document:delete:any')
  @Get('document-delete-any')
  documentDeleteAny() {
    return { ok: true };
  }

  @RequirePermission('analysis:run')
  @Get('analysis-run')
  analysisRun() {
    return { ok: true };
  }

  @RequirePermission('audit:read')
  @Get('audit-read')
  auditRead() {
    return { ok: true };
  }

  @RequirePermission('member:manage')
  @Get('member-manage')
  memberManage() {
    return { ok: true };
  }

  @RequirePermission('organization:delete')
  @Get('organization-delete')
  organizationDelete() {
    return { ok: true };
  }
}

@Module({ controllers: [TestController] })
class TestFeatureModule {}

/** In-memory membership: `${userId}:${organizationId}` -> role. */
const memberships = new Map<string, Role>();

describe('authentication and authorization', () => {
  let app: NestFastifyApplication;
  let tokens: TestTokens;

  beforeAll(async () => {
    tokens = await TestTokens.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: () => testEnv() }),
        TelemetryModule,
        AuthModule,
        TestFeatureModule,
      ],
    })
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tokens.jwks)
      .overrideProvider(MembershipService)
      .useValue({
        findRole: (userId: string, organizationId: string) =>
          Promise.resolve(memberships.get(`${userId}:${organizationId}`) ?? null),
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    memberships.clear();
    memberships.set('user-1:org-1', 'member');
  });

  const get = (path: string, token?: string) =>
    app.inject({
      method: 'GET',
      url: path,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  describe('token verification', () => {
    it('accepts a valid token and exposes the principal', async () => {
      const response = await get('/test/whoami', await tokens.sign());
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        userId: 'user-1',
        sessionId: 'session-1',
        organizationId: 'org-1',
        role: 'member',
      });
    });

    it('rejects a request without a token with a Bearer challenge', async () => {
      const response = await get('/test/whoami');
      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.json()).toMatchObject({ errorCode: ERROR_CODES.UNAUTHENTICATED });
    });

    const invalid: Array<[string, () => Promise<string>]> = [
      ['malformed', () => Promise.resolve('not.a.jwt')],
      ['expired', () => tokens.sign({ expiresIn: -120 })],
      ['wrong issuer', () => tokens.sign({ issuer: 'http://evil.test' })],
      ['wrong audience', () => tokens.sign({ audience: 'another-api' })],
      ['wrong algorithm (ES256)', () => tokens.sign({ algorithm: 'ES256' })],
      ['missing sub', () => tokens.sign({ sub: '' })],
      ['missing sid', () => tokens.sign({ extraClaims: { sid: undefined } })],
    ];

    it.each(invalid)('rejects a %s token with 401', async (_name, makeToken) => {
      const response = await get('/test/whoami', await makeToken());
      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
      expect(response.json()).toMatchObject({ errorCode: ERROR_CODES.UNAUTHENTICATED });
    });

    it('rejects non-bearer authorization schemes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/whoami',
        headers: { authorization: `Basic ${Buffer.from('a:b').toString('base64')}` },
      });
      expect(response.statusCode).toBe(401);
    });

    it('tolerates small clock skew', async () => {
      const response = await get('/test/whoami', await tokens.sign({ expiresIn: -10 }));
      expect(response.statusCode).toBe(200);
    });
  });

  describe('organization membership', () => {
    it('returns 403 NO_ACTIVE_ORGANIZATION without an org claim', async () => {
      const response = await get('/test/whoami', await tokens.sign({ org: null }));
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ errorCode: ERROR_CODES.NO_ACTIVE_ORGANIZATION });
    });

    it('returns 403 FORBIDDEN when the caller is not a member', async () => {
      const response = await get('/test/whoami', await tokens.sign({ org: 'org-2' }));
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ errorCode: ERROR_CODES.FORBIDDEN });
    });

    it('re-reads the role on every request', async () => {
      const token = await tokens.sign();
      expect((await get('/test/document-upload', token)).statusCode).toBe(200);

      memberships.set('user-1:org-1', 'viewer');
      expect((await get('/test/document-upload', token)).statusCode).toBe(403);

      memberships.delete('user-1:org-1');
      expect((await get('/test/whoami', token)).statusCode).toBe(403);
    });
  });

  describe('permissions', () => {
    const cells = ROLES.flatMap((role) =>
      PERMISSIONS.map((permission) => ({
        role,
        permission,
        path: `/test/${permission.replaceAll(':', '-')}`,
        allowed: ROLE_PERMISSIONS[role].includes(permission),
      })),
    );

    it.each(cells.filter((cell) => cell.allowed))(
      '$role is granted $permission',
      async ({ role, path }) => {
        memberships.set('user-1:org-1', role);
        const response = await get(path, await tokens.sign());
        expect(response.statusCode).toBe(200);
      },
    );

    it.each(cells.filter((cell) => !cell.allowed))(
      '$role is denied $permission',
      async ({ role, path }) => {
        memberships.set('user-1:org-1', role);
        const response = await get(path, await tokens.sign());
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ errorCode: ERROR_CODES.FORBIDDEN });
      },
    );

    it('denies authenticated routes that declare no permission', async () => {
      memberships.set('user-1:org-1', 'owner');
      const response = await get('/test/undeclared', await tokens.sign());
      expect(response.statusCode).toBe(403);
    });

    it('keeps @Public() routes open without a token', async () => {
      const response = await get('/test/public');
      expect(response.statusCode).toBe(200);
    });
  });
});
