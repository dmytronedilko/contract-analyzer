import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthGuard } from './auth.guard.js';
import { MembershipService } from './membership.service.js';
import { jwksResolverProvider, TokenVerifier } from './token-verifier.service.js';

@Module({
  providers: [
    jwksResolverProvider,
    TokenVerifier,
    MembershipService,
    // Global guards run in registration order: authentication first.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
