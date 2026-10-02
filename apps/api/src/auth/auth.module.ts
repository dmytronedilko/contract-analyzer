import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthGuard } from './auth.guard.js';
import { MembershipService } from './membership.service.js';
import { PermissionsGuard } from './permissions.guard.js';
import { jwksResolverProvider, TokenVerifier } from './token-verifier.service.js';

@Module({
  providers: [
    jwksResolverProvider,
    TokenVerifier,
    MembershipService,
    // Global guards run in registration order: authentication, then authorization.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
