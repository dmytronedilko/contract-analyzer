import { describe, expect, it } from 'vitest';

import { EnvSchema } from './env.schema.js';

const required = {
  DATABASE_URL: 'postgres://u:p@db:5432/app',
  ANTHROPIC_API_KEY: 'key',
  VOYAGE_API_KEY: 'key',
  AUTH_JWKS_URL: 'http://web:3000/api/auth/jwks',
  AUTH_ISSUER: 'https://contracts.example.com',
};

describe('EnvSchema', () => {
  it('treats empty strings as unset so defaults apply', () => {
    const env = EnvSchema.parse({
      ...required,
      ANTHROPIC_MODEL: '',
      RAG_TOP_K: '',
      CORS_ORIGINS: '',
      OBSERVE_FORWARD_LOGS: '',
    });
    expect(env).toMatchObject({
      ANTHROPIC_MODEL: 'claude-sonnet-5-5',
      RAG_TOP_K: 5,
      OBSERVE_FORWARD_LOGS: false,
    });
    expect(env.CORS_ORIGINS).toBeUndefined();
  });

  it('parses CORS origins and requires https in production', () => {
    expect(
      EnvSchema.parse({ ...required, CORS_ORIGINS: 'https://a.example.com, https://b.example.com' })
        .CORS_ORIGINS,
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(
      EnvSchema.safeParse({ ...required, CORS_ORIGINS: 'https://a.example.com/' }).success,
    ).toBe(false);
    expect(EnvSchema.safeParse({ ...required, CORS_ORIGINS: '*' }).success).toBe(false);
    expect(
      EnvSchema.safeParse({ ...required, CORS_ORIGINS: 'http://localhost:5173' }).success,
    ).toBe(true);
    expect(
      EnvSchema.safeParse({
        ...required,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'http://localhost:5173',
      }).success,
    ).toBe(false);
  });
});
