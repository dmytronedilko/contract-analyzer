/**
 * Schema-only Better Auth configuration, used by `pnpm --filter @repo/db auth:generate` to
 * generate src/auth-schema.ts with the Better Auth CLI.
 *
 * It must enable the same schema-affecting features as the web app's real configuration
 * (apps/web/lib/auth.ts): the organization and JWT plugins, and database-backed rate limiting.
 * Regenerate whenever those plugins or their schema options change. Nothing here runs at
 * runtime and no database connection is opened.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { jwt, organization } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/node-postgres';

export const auth = betterAuth({
  database: drizzleAdapter(drizzle.mock(), { provider: 'pg' }),
  rateLimit: { enabled: true, storage: 'database' },
  telemetry: { enabled: false },
  plugins: [organization(), jwt()],
});
