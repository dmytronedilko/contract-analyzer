import { Controller, Get, SerializeOptions, ServiceUnavailableException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/database.js';

import { Public } from '../auth/public.decorator.js';

const HealthResponseSchema = z.object({ status: z.literal('ok') });
type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** A readiness probe must answer quickly even when the database hangs. */
const READY_TIMEOUT_MS = 2_000;

/**
 * Health endpoints for container healthchecks and smoke tests. Both are public, skip rate
 * limiting and are excluded from tracing (see the Observe `http.ignore` option).
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Liveness: the process is up and serving requests. No dependencies are checked. */
  @Get()
  @SerializeOptions({ schema: HealthResponseSchema })
  live(): HealthResponse {
    return { status: 'ok' };
  }

  /** Readiness: the database answers `select 1`. Used by the compose healthcheck. */
  @Get('ready')
  @SerializeOptions({ schema: HealthResponseSchema })
  async ready(): Promise<HealthResponse> {
    const timeout = AbortSignal.timeout(READY_TIMEOUT_MS);
    try {
      await Promise.race([
        this.db.execute(sql`select 1`),
        new Promise((_, reject) => {
          timeout.addEventListener('abort', () => reject(timeout.reason), { once: true });
        }),
      ]);
    } catch (error) {
      throw new ServiceUnavailableException('Database unavailable', { cause: error });
    }
    return { status: 'ok' };
  }
}
