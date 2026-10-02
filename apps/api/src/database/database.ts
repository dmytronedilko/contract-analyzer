import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** The Drizzle database registered by DrizzleModule; inject it with `@InjectDrizzle()`. */
export type Database = NodePgDatabase;

/** A transaction started with `db.transaction()`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Either the database or an open transaction, for writes that callers may group atomically. */
export type Executor = Database | Transaction;
