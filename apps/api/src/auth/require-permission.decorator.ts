import { SetMetadata } from '@nestjs/common';

import type { Permission } from '@repo/contracts';

export const REQUIRED_PERMISSIONS_KEY = 'auth:requiredPermissions';

/**
 * Declares the permission a route requires. With several permissions, any one of them grants
 * access (e.g. delete allows `document:delete:own` or `document:delete:any`; the service then
 * checks ownership). Every non-public route must declare one: PermissionsGuard denies routes
 * that don't.
 */
export const RequirePermission = (...permissions: [Permission, ...Permission[]]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
