import type { FastifyRequest } from 'fastify';

import {
  ForbiddenException,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ERROR_CODES, hasPermission, type Permission } from '@repo/contracts';

import { IS_PUBLIC_KEY } from './public.decorator.js';
import { REQUIRED_PERMISSIONS_KEY } from './require-permission.decorator.js';

/**
 * Global guard that runs after AuthGuard and checks the caller's role against
 * ROLE_PERMISSIONS from @repo/contracts. It fails closed: an authenticated route without
 * @RequirePermission() is denied, so a forgotten decorator can't expose an endpoint.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      targets,
    );
    if (!required?.length) {
      this.logger.error('Route has no @RequirePermission() and was denied', {
        handler: `${context.getClass().name}.${context.getHandler().name}`,
      });
      throw this.forbidden();
    }

    const principal = context.switchToHttp().getRequest<FastifyRequest>().principal;
    if (!principal || !required.some((permission) => hasPermission(principal.role, permission))) {
      throw this.forbidden();
    }
    return true;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException("You don't have permission to do this", {
      errorCode: ERROR_CODES.FORBIDDEN,
    });
  }
}
