import { hasPermission, ROLES, type Permission, type Role } from '@repo/contracts';

/**
 * The role a member row grants. Better Auth may store several comma-separated roles; roles nest,
 * so the highest known one wins, exactly as the API resolves it. Unknown roles grant nothing.
 */
export function parseRole(value: string | null | undefined): Role | null {
  const assigned = new Set((value ?? '').split(',').map((role) => role.trim()));
  return ROLES.find((role) => assigned.has(role)) ?? null;
}

/**
 * Whether the UI should offer an action. A convenience only: the API enforces every permission
 * from the same ROLE_PERMISSIONS matrix.
 */
export function can(role: Role | null, permission: Permission): boolean {
  return role !== null && hasPermission(role, permission);
}

/** Members may delete their own uploads; owners and admins may delete any document. */
export function canDeleteDocument(
  role: Role | null,
  userId: string,
  uploadedBy: { id: string } | null,
): boolean {
  return (
    can(role, 'document:delete:any') ||
    (can(role, 'document:delete:own') && uploadedBy?.id === userId)
  );
}
