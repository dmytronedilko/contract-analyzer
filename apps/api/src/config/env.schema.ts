import { z } from 'zod';

/** Treats empty strings (e.g. `CORS_ORIGINS=` in an env file) as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** An origin is scheme + host (+ port): no path, trailing slash, wildcard or credentials. */
function parseOrigin(entry: string): URL | undefined {
  try {
    const url = new URL(entry);
    return url.origin === entry ? url : undefined;
  } catch {
    return undefined;
  }
}

const CorsOriginsSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  .check((ctx) => {
    for (const entry of ctx.value) {
      const url = parseOrigin(entry);
      if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
        ctx.issues.push({
          code: 'custom',
          input: entry,
          message: `"${entry}" is not an exact origin (scheme://host[:port], no path or wildcard)`,
        });
      }
    }
  });

const EnvObjectSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    ANTHROPIC_API_KEY: z.string().min(1),
    ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
    VOYAGE_API_KEY: z.string().min(1),
    VOYAGE_MODEL: z.string().min(1).default('voyage-law-2'),

    RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(25),
    GIT_SHA: optional(z.string()),

    AUTH_JWKS_URL: z.url({ protocol: /^https?$/ }),
    AUTH_ISSUER: z.url({ protocol: /^https?$/ }),
    AUTH_AUDIENCE: z.string().min(1).default('legal-rag-api'),
    RATE_LIMIT_ANALYSIS_PER_MINUTE: z.coerce.number().int().min(1).default(30),
    RATE_LIMIT_UPLOADS_PER_HOUR: z.coerce.number().int().min(1).default(20),

    CORS_ORIGINS: optional(CorsOriginsSchema),

    OBSERVE_APP_KEY: optional(z.string()),
    OBSERVE_APP_SECRET: optional(z.string()),
    OBSERVE_SERVICE_ID: z.string().min(1).default('legal-rag-api'),
    OBSERVE_ENDPOINT: optional(z.url({ protocol: /^https?$/ })),
    OBSERVE_FORWARD_LOGS: optional(z.stringbool()).transform((value) => value ?? false),
    OBSERVE_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
  })
  .check((ctx) => {
    const { NODE_ENV, CORS_ORIGINS = [] } = ctx.value;
    for (const origin of CORS_ORIGINS) {
      const url = new URL(origin);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      // Production requires https; development may use http://localhost:<port>.
      if (url.protocol === 'http:' && (NODE_ENV === 'production' || !isLocalhost)) {
        ctx.issues.push({
          code: 'custom',
          input: origin,
          path: ['CORS_ORIGINS'],
          message: `"${origin}" must use https${NODE_ENV === 'production' ? ' in production' : ' unless it is localhost'}`,
        });
      }
    }
  });

/**
 * Empty values count as unset, so defaults apply: Compose and env files pass unset optional
 * variables as empty strings (e.g. `ANTHROPIC_MODEL=`).
 */
function withoutEmptyValues(env: unknown): unknown {
  if (typeof env !== 'object' || env === null) return env;
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
}

export const EnvSchema = z.preprocess(withoutEmptyValues, EnvObjectSchema);

export type Env = z.infer<typeof EnvSchema>;
