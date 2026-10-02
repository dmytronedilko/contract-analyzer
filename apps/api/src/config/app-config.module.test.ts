import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

import type { Env } from './env.schema.js';

import { appConfigModule } from './app-config.module.js';

const REQUIRED = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/test',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  VOYAGE_API_KEY: 'test-voyage-key',
  AUTH_JWKS_URL: 'http://web.test/api/auth/jwks',
  AUTH_ISSUER: 'http://web.test',
};

describe('appConfigModule', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns validated values only: an empty optional variable is undefined, not ""', async () => {
    Object.assign(process.env, REQUIRED, { OBSERVE_ENDPOINT: '', CORS_ORIGINS: '', GIT_SHA: '' });
    const moduleRef = await Test.createTestingModule({ imports: [appConfigModule()] }).compile();
    const config = moduleRef.get<ConfigService<Env, true>>(ConfigService);

    expect(config.get('OBSERVE_ENDPOINT', { infer: true })).toBeUndefined();
    expect(config.get('CORS_ORIGINS', { infer: true })).toBeUndefined();
    expect(config.get('GIT_SHA', { infer: true })).toBeUndefined();
    // Defaults and coercion still come from the schema.
    expect(config.get('RAG_TOP_K', { infer: true })).toBe(5);
  });

  it('refuses to start with a readable message when a variable is invalid', async () => {
    Object.assign(process.env, REQUIRED, { RAG_TOP_K: 'many' });
    await expect(appConfigModule()).rejects.toThrow(/^Config validation error:\n.*RAG_TOP_K/s);
  });
});
