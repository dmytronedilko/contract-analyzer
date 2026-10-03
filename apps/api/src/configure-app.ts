import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import fastifyMultipart from '@fastify/multipart';
import { StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import type { Env } from './config/env.schema.js';

import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { registerHttpPolicy } from './http/http-policy.js';

/**
 * Applies the HTTP-level configuration shared by main.ts and the integration tests, in order:
 * request ids and the origin guard (before CORS, so preflights are covered too), CORS, multipart
 * limits, then global validation, serialization and error mapping.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  registerHttpPolicy(app, { corsOrigins: config.get('CORS_ORIGINS', { infer: true }) ?? [] });

  await app.register(fastifyMultipart, {
    // One PDF per request; anything larger than MAX_UPLOAD_MB is rejected while streaming.
    limits: {
      fileSize: config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024,
      files: 1,
      fields: 5,
      parts: 6,
    },
  });

  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new ApiExceptionFilter());
}
