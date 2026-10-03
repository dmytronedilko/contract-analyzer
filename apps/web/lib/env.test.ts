import { describe, expect, it } from 'vitest';

import { ServerEnvSchema } from './env';

const base = {
  BACKEND_URL: 'http://api:3001',
  DATABASE_URL: 'postgres://u:p@db:5432/app',
  APP_URL: 'https://contracts.example.com/',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
};
const oidc = {
  AUTH_OIDC_NAME: 'Okta',
  AUTH_OIDC_ISSUER: 'https://idp.example.com',
  AUTH_OIDC_CLIENT_ID: 'id',
  AUTH_OIDC_CLIENT_SECRET: 'secret',
};

describe('ServerEnvSchema', () => {
  it('applies defaults and normalizes APP_URL to an origin', () => {
    const env = ServerEnvSchema.parse({ ...base, ...oidc });
    expect(env).toMatchObject({
      APP_URL: 'https://contracts.example.com',
      AUTH_AUDIENCE: 'legal-rag-api',
      AUTH_SESSION_TTL_HOURS: 12,
      NEXT_PUBLIC_MAX_UPLOAD_MB: 25,
    });
  });

  it('starts without an identity provider in any mode', () => {
    for (const NODE_ENV of ['development', 'production']) {
      expect(ServerEnvSchema.safeParse({ ...base, NODE_ENV }).success).toBe(true);
    }
  });

  it('rejects a partially configured provider', () => {
    const result = ServerEnvSchema.safeParse({ ...base, AUTH_GOOGLE_CLIENT_ID: 'id' });
    expect(result.success).toBe(false);
  });

  it('rejects a short secret', () => {
    expect(ServerEnvSchema.safeParse({ ...base, BETTER_AUTH_SECRET: 'short' }).success).toBe(false);
  });

  it('parses comma-separated lists, lower-cased', () => {
    const env = ServerEnvSchema.parse({
      ...base,
      AUTH_ALLOWED_EMAIL_DOMAINS: 'Firm.example, other.example ,',
    });
    expect(env.AUTH_ALLOWED_EMAIL_DOMAINS).toEqual(['firm.example', 'other.example']);
  });
});

describe('empty values', () => {
  it('treats empty strings as unset so defaults apply', () => {
    const env = ServerEnvSchema.parse({
      ...base,
      ...oidc,
      AUTH_AUDIENCE: '',
      AUTH_SESSION_TTL_HOURS: '',
      AUTH_GOOGLE_CLIENT_ID: '',
      AUTH_GOOGLE_CLIENT_SECRET: '',
    });
    expect(env.AUTH_AUDIENCE).toBe('legal-rag-api');
    expect(env.AUTH_SESSION_TTL_HOURS).toBe(12);
    expect(env.AUTH_GOOGLE_CLIENT_ID).toBeUndefined();
  });
});
