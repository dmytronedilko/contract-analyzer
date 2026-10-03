import 'server-only';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '@repo/db';

import { serverEnv } from './env';

export type WebDatabase = NodePgDatabase<typeof schema>;

declare global {
  // Survives dev-mode hot reloads, so they don't open a new pool each time.
  var webDatabase: WebDatabase | undefined;
}

/** One pool for the whole web server, shared by Better Auth's Drizzle adapter and audit writes. */
export function db(): WebDatabase {
  globalThis.webDatabase ??= drizzle({
    client: new Pool({ connectionString: serverEnv().DATABASE_URL, max: 10 }),
    schema,
  });
  return globalThis.webDatabase;
}
