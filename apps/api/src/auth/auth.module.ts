import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthGuard } from './auth.guard.js';
import { MembershipService } from './membership.service.js';
import { PermissionsGuard } from './permissions.guard.js';
import { rateLimitOptions, UserThrottlerGuard } from './rate-limit.js';
import { jwksResolverProvider, TokenVerifier } from './token-verifier.service.js';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({ inject: [ConfigService], useFactory: rateLimitOptions }),
  ],
  providers: [
    jwksResolverProvider,
    TokenVerifier,
    MembershipService,
    // Global guards run in registration order: authentication, authorization, then per-user
    // rate limits (which need the authenticated user id).
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AuthModule {}
