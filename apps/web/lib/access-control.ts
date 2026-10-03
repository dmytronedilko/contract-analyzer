import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access';

import { ROLE_PERMISSIONS, ROLES, toPermissionStatements, type Role } from '@repo/contracts';

type Statements = Record<string, readonly string[]>;

function merge(...sets: Statements[]): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const set of sets) {
    for (const [resource, actions] of Object.entries(set)) {
      merged[resource] = [...new Set([...(merged[resource] ?? []), ...actions])];
    }
  }
  return merged;
}

/**
 * Better Auth access control built from ROLE_PERMISSIONS in @repo/contracts (the same matrix the
 * API guards enforce), together with Better Auth's own organization, member and invitation
 * statements, which gate its built-in endpoints (invite, remove member, delete organization...).
 */
export const statements = merge(defaultStatements, toPermissionStatements(ROLE_PERMISSIONS.owner));
export const ac = createAccessControl(statements);

const builtIn: Record<Role, Statements> = {
  owner: ownerAc.statements,
  admin: adminAc.statements,
  member: memberAc.statements,
  viewer: memberAc.statements,
};

const roleFor = (role: Role) =>
  ac.newRole(merge(builtIn[role], toPermissionStatements(ROLE_PERMISSIONS[role])));

export const roles = {
  owner: roleFor('owner'),
  admin: roleFor('admin'),
  member: roleFor('member'),
  viewer: roleFor('viewer'),
} satisfies Record<(typeof ROLES)[number], ReturnType<typeof roleFor>>;
