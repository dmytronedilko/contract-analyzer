import 'server-only';
import { z } from 'zod';

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** Comma-separated, trimmed, lower-cased list; empty means "not configured". */
const list = z.string().transform((value) =>
  value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

const ServerEnvObjectSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    BACKEND_URL: z.url({ protocol: /^https?$/ }),
    NEXT_PUBLIC_MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(25),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** The public origin of this app, e.g. https://contracts.example.com. */
    APP_URL: z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin),
    /** At least 32 random bytes; signs sessions and encrypts the JWKS private keys. */
    BETTER_AUTH_SECRET: z.string().min(32),
    AUTH_AUDIENCE: z.string().min(1).default('legal-rag-api'),
    AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
    AUTH_ALLOWED_EMAIL_DOMAINS: optional(list),
    AUTH_ORG_CREATOR_EMAILS: optional(list),

    AUTH_MICROSOFT_CLIENT_ID: optional(z.string()),
    AUTH_MICROSOFT_CLIENT_SECRET: optional(z.string()),
    AUTH_MICROSOFT_TENANT_ID: optional(z.string()),
    AUTH_GOOGLE_CLIENT_ID: optional(z.string()),
    AUTH_GOOGLE_CLIENT_SECRET: optional(z.string()),
    AUTH_OIDC_NAME: optional(z.string()),
    AUTH_OIDC_ISSUER: optional(z.url({ protocol: /^https?$/ })),
    AUTH_OIDC_CLIENT_ID: optional(z.string()),
    AUTH_OIDC_CLIENT_SECRET: optional(z.string()),
  })
  .check((ctx) => {
    const env = ctx.value;
    const groups = {
      microsoft: [
        'AUTH_MICROSOFT_CLIENT_ID',
        'AUTH_MICROSOFT_CLIENT_SECRET',
        'AUTH_MICROSOFT_TENANT_ID',
      ],
      google: ['AUTH_GOOGLE_CLIENT_ID', 'AUTH_GOOGLE_CLIENT_SECRET'],
      oidc: [
        'AUTH_OIDC_NAME',
        'AUTH_OIDC_ISSUER',
        'AUTH_OIDC_CLIENT_ID',
        'AUTH_OIDC_CLIENT_SECRET',
      ],
    } as const;
    for (const [provider, keys] of Object.entries(groups)) {
      const set = keys.filter((key) => env[key] !== undefined);
      if (set.length > 0 && set.length < keys.length) {
        ctx.issues.push({
          code: 'custom',
          input: set,
          message: `Incomplete ${provider} provider: set all of ${keys.join(', ')} or none`,
        });
      }
    }
  });

/**
 * Server-only configuration; nothing here may be exposed to the browser. Empty values count as
 * unset, so defaults apply: Compose passes unset optional variables as empty strings.
 */
export const ServerEnvSchema = z.preprocess(
  (env: unknown) =>
    typeof env === 'object' && env !== null
      ? Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''))
      : env,
  ServerEnvObjectSchema,
);

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/** Every variable the web server reads (documented on the wiki's Configuration page). */
export const SERVER_ENV_VARIABLES = Object.keys(ServerEnvObjectSchema.shape);

let cached: ServerEnv | undefined;

/**
 * Validated on first use, not at import: `next build` imports server modules without the runtime
 * environment, and validation must not fail the build.
 */
export function serverEnv(): ServerEnv {
  cached ??= ServerEnvSchema.parse(process.env);
  return cached;
}
