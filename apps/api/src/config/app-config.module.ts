import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';

import { EnvSchema } from './env.schema.js';

/**
 * The validated configuration. Env vars come from the process (Node's --env-file in dev, real env
 * vars in Docker), so no .env file is read here.
 *
 * ConfigService must return the schema's output only. An empty optional variable such as
 * `OBSERVE_ENDPOINT=` parses to undefined, and Zod leaves undefined optional keys out of its
 * output; `validationSchema` merges the raw variables back in, and `get` falls back to process.env,
 * so either would turn it into "". `validate` keeps just the parsed result, and `skipProcessEnv`
 * stops the fallback.
 */
export function appConfigModule() {
  return ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    ignoreEnvFile: true,
    skipProcessEnv: true,
    validate: (raw) => {
      const result = EnvSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(`Config validation error:\n${z.prettifyError(result.error)}`);
      }
      return result.data;
    },
  });
}
