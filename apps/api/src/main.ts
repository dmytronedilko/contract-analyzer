import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import type { Env } from './config/env.schema.js';

import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { observeEnabled, ObserveInstrument } from './observability/observe.js';

async function bootstrap(): Promise<void> {
  // With an explicit adapter, application options must be the third argument.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    // Skipped entirely when Observe is disabled (no account, tests, CI).
    ...(observeEnabled ? { instrument: ObserveInstrument } : {}),
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
    routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
  });

  await configureApp(app);
  app.enableShutdownHooks();

  // Fastify's default host (localhost) is unreachable from other containers.
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

await bootstrap();
