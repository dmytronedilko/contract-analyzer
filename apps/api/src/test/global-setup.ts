import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';

/**
 * Applies @repo/db's migrations to TEST_DATABASE_URL before the integration suites run. Without
 * TEST_DATABASE_URL those suites are skipped (CI always sets it).
 */
export default async function setup(): Promise<void> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) return;
  // @repo/db ships its migrations next to dist/ (Vitest's runner has no import.meta.resolve).
  const entry = createRequire(import.meta.url).resolve('@repo/db');
  const migrationsFolder = join(dirname(entry), '..', 'drizzle');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
