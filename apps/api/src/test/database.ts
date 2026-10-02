import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

import { member, organization, user, type NewChunkRow } from '@repo/db';

import type { Database } from '../database/database.js';

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

/** Skip a suite unless an integration database is configured. */
export const hasTestDatabase = Boolean(testDatabaseUrl);

export interface TestDatabase {
  db: Database;
  pool: Pool;
  close(): Promise<void>;
}

export function connectTestDatabase(): TestDatabase {
  const pool = new Pool({ connectionString: testDatabaseUrl, max: 4 });
  return { db: drizzle({ client: pool }), pool, close: () => pool.end() };
}

export interface SeededOrganization {
  organizationId: string;
  userId: string;
}

/**
 * Creates an organization with one member of the given role. Ids are random, so suites can run
 * in parallel against one database; deleting the organization cascades to its data.
 */
export async function seedOrganization(db: Database, role = 'owner'): Promise<SeededOrganization> {
  const organizationId = `org_${randomUUID()}`;
  const userId = `user_${randomUUID()}`;
  const now = new Date();
  await db.insert(organization).values({
    id: organizationId,
    name: 'Test Org',
    slug: organizationId,
    createdAt: now,
  });
  await db.insert(user).values({
    id: userId,
    name: 'Test User',
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(member).values({
    id: `member_${randomUUID()}`,
    organizationId,
    userId,
    role,
    createdAt: now,
  });
  return { organizationId, userId };
}

/** A deterministic 1024-dimension vector pointing mostly along `axis`. */
export function unitVector(axis: number, noise = 0.05): number[] {
  return Array.from({ length: 1024 }, (_, i) =>
    i === axis ? 1 : noise * Math.sin((i + 1) * (axis + 1)),
  );
}

export function chunkRows(documentId: string, count: number, axisOffset = 0): NewChunkRow[] {
  return Array.from({ length: count }, (_, i) => ({
    documentId,
    chunkIndex: i,
    pageStart: i + 1,
    pageEnd: i + 1,
    content: `chunk ${i}`,
    embedding: unitVector(axisOffset + i),
  }));
}
