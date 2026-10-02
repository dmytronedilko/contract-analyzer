import {
  ConsoleLogger,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import type { Env } from './config/env.schema.js';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  // With an explicit adapter, application options must be the third argument.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
    routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();

  // Fastify's default host (localhost) is unreachable from other containers.
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

await bootstrap();
