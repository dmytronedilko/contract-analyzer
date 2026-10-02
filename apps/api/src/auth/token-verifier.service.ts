import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import type { Env } from '../config/env.schema.js';

/** Injection token for the key resolver; tests replace it with a local JWKS. */
export const JWKS_RESOLVER = Symbol('JWKS_RESOLVER');

/**
 * The web app's JWKS. jose fetches it lazily on first use, caches it, and refetches when a token
 * carries an unknown `kid` (e.g. after key rotation).
 */
export const jwksResolverProvider = {
  provide: JWKS_RESOLVER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): JWTVerifyGetKey =>
    createRemoteJWKSet(new URL(config.get('AUTH_JWKS_URL', { infer: true })), {
      timeoutDuration: 5_000,
    }),
};

export interface VerifiedToken {
  userId: string;
  sessionId: string;
  /** The session's active organization, or null when none is selected. */
  organizationId: string | null;
}

/** Verifies the short-lived EdDSA JWTs minted by the web app's Better Auth JWT plugin. */
@Injectable()
export class TokenVerifier {
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    @Inject(JWKS_RESOLVER) private readonly jwks: JWTVerifyGetKey,
    config: ConfigService<Env, true>,
  ) {
    this.issuer = config.get('AUTH_ISSUER', { infer: true });
    this.audience = config.get('AUTH_AUDIENCE', { infer: true });
  }

  /** Throws when the token is malformed, expired, or has the wrong issuer, audience or algorithm. */
  async verify(token: string): Promise<VerifiedToken> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['EdDSA'],
      clockTolerance: '30s',
      requiredClaims: ['sub', 'sid', 'exp'],
    });
    const { sub, sid, org } = payload;
    if (typeof sub !== 'string' || !sub || typeof sid !== 'string' || !sid) {
      throw new Error('Token is missing sub or sid');
    }
    return {
      userId: sub,
      sessionId: sid,
      organizationId: typeof org === 'string' && org ? org : null,
    };
  }
}
