import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

/**
 * Applies all pending migrations from ../drizzle and exits.
 *
 * Production runs this from the API image as the one-off `migrate` compose service, before the
 * new API starts. drizzle-kit is a dev dependency only and is not needed here. Migrations are
 * forward-only and must stay backward-compatible with the previous API release, which keeps
 * serving while they run.
 */
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString, max: 1 });
  try {
    const startedAt = performance.now();
    await migrate(drizzle({ client: pool }), { migrationsFolder });
    console.log(`Migrations applied in ${Math.round(performance.now() - startedAt)} ms`);
  } finally {
    await pool.end();
  }
}

/**
 * Messages and codes of the error and its causes: drizzle wraps the driver error in a
 * "Failed query" one, and a refused connection is an AggregateError with an empty message.
 */
function describe(error: unknown): string {
  const parts: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) {
    const code = 'code' in current && typeof current.code === 'string' ? current.code : undefined;
    const message = current.message.split('\n')[0]?.trim();
    const part = [code, message].filter(Boolean).join(' ');
    if (part) parts.push(part);
  }
  return parts.join(' <- ') || 'unknown error';
}

main().catch((error: unknown) => {
  // Messages only, never the error object: it can carry the connection string.
  console.error(`Migration failed: ${describe(error)}`);
  process.exitCode = 1;
});
