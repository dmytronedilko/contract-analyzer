import type { FastifyRequest } from 'fastify';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';

import type { Env } from './config/env.schema.js';

import { AnalysisModule } from './analysis/analysis.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { appConfigModule } from './config/app-config.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthModule } from './health/health.module.js';
import {
  OBSERVE_HOSTED_ENDPOINT,
  observeEnabled,
  ObserveModule,
  REDACTION_PATTERNS,
} from './observability/observe.js';

@Module({
  imports: [
    appConfigModule(),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: { connectionString: config.get('DATABASE_URL', { infer: true }) },
      }),
    }),
    ...(observeEnabled
      ? [
          ObserveModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
              appKey: config.get('OBSERVE_APP_KEY', { infer: true }) ?? '',
              appSecret: config.get('OBSERVE_APP_SECRET', { infer: true }) ?? '',
              serviceId: config.get('OBSERVE_SERVICE_ID', { infer: true }),
              serviceVersion: config.get('GIT_SHA', { infer: true }),
              endpoint: config.get('OBSERVE_ENDPOINT', { infer: true }) ?? OBSERVE_HOSTED_ENDPOINT,
              http: {
                // Health checks and CORS preflights are not traced.
                ignore: [/^\/health/, { method: 'OPTIONS', path: /.*/ }],
                // Opaque ids only, never emails or names.
                getUserId: (req: FastifyRequest) => req.principal?.userId ?? 'anonymous',
                setAttributes: (req: FastifyRequest) => ({
                  organizationId: req.principal?.organizationId ?? 'none',
                }),
                tags: { env: config.get('NODE_ENV', { infer: true }) },
                // Default header allow-list only. NEVER enable `body`: requests carry PDFs and
                // contract questions.
                capture: { slowerThanMs: 30_000 },
              },
              // Query spans carry statements without literals; bound parameters are never sent.
              // Trace ids are not propagated to Anthropic or Voyage.
              outgoing: { database: true, http: { propagateTraceId: () => false } },
              redaction: {
                enabled: true,
                keys: ['x-api-key', 'appSecret'],
                patterns: REDACTION_PATTERNS,
              },
              forwardLogs: config.get('OBSERVE_FORWARD_LOGS', { infer: true }),
              tracesSampleRate: config.get('OBSERVE_TRACES_SAMPLE_RATE', { infer: true }),
            }),
          }),
        ]
      : []),
    AuthModule,
    AuditModule,
    DocumentsModule,
    AnalysisModule,
    HealthModule,
  ],
})
export class AppModule {}
