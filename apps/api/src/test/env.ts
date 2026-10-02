import { EnvSchema, type Env } from '../config/env.schema.js';

/** A valid environment for tests. Providers are never called; keys are dummies. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return EnvSchema.parse({
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/test',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    VOYAGE_API_KEY: 'test-voyage-key',
    AUTH_JWKS_URL: 'http://web.test/api/auth/jwks',
    AUTH_ISSUER: 'http://web.test',
    AUTH_AUDIENCE: 'legal-rag-api',
    ...overrides,
  });
}
