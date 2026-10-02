import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** The Drizzle database registered by DrizzleModule; inject it with `@InjectDrizzle()`. */
export type Database = NodePgDatabase;
