import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

import { member, user } from '@repo/db';

import type { Database } from '../database/database.js';

import { LlmService } from '../analysis/llm.service.js';
import { JWKS_RESOLVER } from '../auth/token-verifier.service.js';
import { configureApp } from '../configure-app.js';
import { EMBEDDING_PROVIDER } from '../embeddings/embedding-provider.js';
import { testEnv } from './env.js';
import { FakeEmbeddingProvider, FakeLlm } from './fakes.js';
import { TestTokens } from './tokens.js';

export interface TestApp {
  app: NestFastifyApplication;
  tokens: TestTokens;
  llm: FakeLlm;
  close(): Promise<void>;
}

/**
 * Boots the real AppModule, configured like production, against TEST_DATABASE_URL. Only the
 * outside world is replaced: the web app's JWKS, the embedding provider and Claude.
 */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  // AppModule's ConfigModule reads process.env when it is imported.
  for (const [key, value] of Object.entries(testEnv(env))) {
    if (value !== undefined)
      vi.stubEnv(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const { AppModule } = await import('../app.module.js');

  const tokens = await TestTokens.create();
  const llm = new FakeLlm();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JWKS_RESOLVER)
    .useValue(tokens.jwks)
    .overrideProvider(EMBEDDING_PROVIDER)
    .useValue(new FakeEmbeddingProvider())
    .overrideProvider(LlmService)
    .useValue(llm)
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    tokens,
    llm,
    close: async () => {
      await app.close();
      vi.unstubAllEnvs();
    },
  };
}

/** Adds a user with the given role to an existing organization. */
export async function addMember(
  db: Database,
  organizationId: string,
  role: string,
): Promise<string> {
  const userId = `user_${randomUUID()}`;
  await db.insert(user).values({
    id: userId,
    name: `${role} user`,
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(member).values({
    id: `member_${randomUUID()}`,
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  });
  return userId;
}
