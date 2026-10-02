import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ERROR_CODES } from '@repo/contracts';

import { MembershipService } from './membership.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { TokenVerifier } from './token-verifier.service.js';

const BEARER = /^Bearer ([A-Za-z0-9_.~+/-]+=*)$/;

/**
 * Global guard: every route except @Public() ones requires a valid bearer JWT from the web app,
 * an active organization in the token, and membership of that organization.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenVerifier,
    private readonly memberships: MembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      reply.header('www-authenticate', 'Bearer');
      throw this.unauthenticated();
    }

    let verified;
    try {
      verified = await this.tokens.verify(token);
    } catch (error) {
      this.logger.debug('Rejected bearer token', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      reply.header('www-authenticate', 'Bearer error="invalid_token"');
      throw this.unauthenticated();
    }

    if (!verified.organizationId) {
      throw new ForbiddenException('No active organization', {
        errorCode: ERROR_CODES.NO_ACTIVE_ORGANIZATION,
      });
    }

    const role = await this.memberships.findRole(verified.userId, verified.organizationId);
    if (!role) {
      throw new ForbiddenException('You are not a member of this organization', {
        errorCode: ERROR_CODES.FORBIDDEN,
      });
    }

    request.principal = {
      userId: verified.userId,
      sessionId: verified.sessionId,
      organizationId: verified.organizationId,
      role,
    };
    return true;
  }

  private unauthenticated(): UnauthorizedException {
    return new UnauthorizedException('Authentication required', {
      errorCode: ERROR_CODES.UNAUTHENTICATED,
    });
  }
}
