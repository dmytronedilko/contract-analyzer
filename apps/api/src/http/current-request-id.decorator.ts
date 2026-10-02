import type { FastifyRequest } from 'fastify';

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { requestIdOf } from './http-policy.js';

/** The request's x-request-id (a UUID set by the HTTP policy), for audit events. */
export const CurrentRequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null =>
    requestIdOf(ctx.switchToHttp().getRequest<FastifyRequest>()) || null,
);
