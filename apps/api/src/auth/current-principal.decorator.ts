import type { FastifyRequest } from 'fastify';

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { Principal } from './principal.js';

/** Injects the caller set by AuthGuard. Only valid on authenticated (non-@Public) routes. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const principal = ctx.switchToHttp().getRequest<FastifyRequest>().principal;
    if (!principal) {
      throw new Error('CurrentPrincipal used on a route without an authenticated principal');
    }
    return principal;
  },
);
