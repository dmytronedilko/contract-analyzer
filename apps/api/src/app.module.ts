import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';

import type { Env } from './config/env.schema.js';

import { appConfigModule } from './config/app-config.module.js';

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
  ],
})
export class AppModule {}
