import { z } from 'zod';

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const PERMISSIONS = [
  'document:read',
  'document:upload',
  'document:delete:own',
  'document:delete:any',
  'analysis:run',
  'audit:read',
  'member:manage',
  'organization:delete',
] as const;
export const PermissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof PermissionSchema>;

/**
 * The single source of truth for authorization. The API guards, Better Auth's access control
 * and the permission-aware UI are all derived from this matrix; change it here only.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: [
    'document:read',
    'analysis:run',
    'document:upload',
    'document:delete:own',
    'document:delete:any',
    'audit:read',
    'member:manage',
    'organization:delete',
  ],
  admin: [
    'document:read',
    'analysis:run',
    'document:upload',
    'document:delete:own',
    'document:delete:any',
    'audit:read',
    'member:manage',
  ],
  member: ['document:read', 'analysis:run', 'document:upload', 'document:delete:own'],
  viewer: ['document:read', 'analysis:run'],
};

export function isRole(value: unknown): value is Role {
  return RoleSchema.safeParse(value).success;
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Groups permissions by resource, e.g. `document:delete:own` becomes
 * `{ document: ['delete:own'] }`. This is the statement shape Better Auth's access control uses.
 */
export function toPermissionStatements(
  permissions: readonly Permission[],
): Record<string, string[]> {
  const statements: Record<string, string[]> = {};
  for (const permission of permissions) {
    const separator = permission.indexOf(':');
    const resource = permission.slice(0, separator);
    const action = permission.slice(separator + 1);
    (statements[resource] ??= []).push(action);
  }
  return statements;
}
