import type { FastifyReply } from 'fastify';

import {
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
} from '@nestjs/throttler';

import { ERROR_CODES } from '@repo/contracts';

import type { Env } from '../config/env.schema.js';

export type RateLimitName = 'analysis' | 'uploads';

const RATE_LIMIT_KEY = 'auth:rateLimit';

/** Applies the named per-user limit to a route. Routes without it are not rate-limited. */
export const RateLimit = (name: RateLimitName) => SetMetadata(RATE_LIMIT_KEY, name);

/**
 * Per-user limits. Storage is in memory, which is correct for the single API instance;
 * running several instances requires shared storage (e.g. Redis) or each gets its own budget.
 */
export function rateLimitOptions(config: ConfigService<Env, true>): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        name: 'analysis',
        ttl: 60_000,
        limit: config.get('RATE_LIMIT_ANALYSIS_PER_MINUTE', { infer: true }),
      },
      {
        name: 'uploads',
        ttl: 3_600_000,
        limit: config.get('RATE_LIMIT_UPLOADS_PER_HOUR', { infer: true }),
      },
    ],
    // One budget per user and limit, shared across the routes that use it (ask and compare).
    generateKey: (_context, tracker, name) => `${name}:${tracker}`,
  };
}

/**
 * Throttler guard registered after AuthGuard and PermissionsGuard: it keys limits by the
 * authenticated user id (never the IP, which the web proxy shares between all users), applies a
 * limit only to routes tagged with @RateLimit(), and answers 429 RATE_LIMITED with Retry-After.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const name = this.reflector.getAllAndOverride<RateLimitName | undefined>(RATE_LIMIT_KEY, [
      requestProps.context.getHandler(),
      requestProps.context.getClass(),
    ]);
    if (name !== requestProps.throttler.name) return true;
    return super.handleRequest(requestProps);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const principal = req.principal;
    if (
      typeof principal !== 'object' ||
      principal === null ||
      !('userId' in principal) ||
      typeof principal.userId !== 'string'
    ) {
      throw new Error('Rate-limited route reached without an authenticated principal');
    }
    return Promise.resolve(principal.userId);
  }

  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfter = Math.max(1, Math.ceil(detail.timeToBlockExpire));
    context.switchToHttp().getResponse<FastifyReply>().header('retry-after', String(retryAfter));
    throw new HttpException(
      {
        message: `Too many requests. Try again in ${retryAfter} seconds.`,
        errorCode: ERROR_CODES.RATE_LIMITED,
      },
      HttpStatus.TOO_MANY_REQUESTS,
      { errorCode: ERROR_CODES.RATE_LIMITED },
    );
  }
}
