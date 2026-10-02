import { describe, expect, it } from 'vitest';

import {
  hasPermission,
  isRole,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  toPermissionStatements,
} from './permissions.js';

describe('ROLE_PERMISSIONS', () => {
  it('only grants known permissions, without duplicates', () => {
    for (const role of ROLES) {
      const granted = ROLE_PERMISSIONS[role];
      expect(new Set(granted).size).toBe(granted.length);
      for (const permission of granted) expect(PERMISSIONS).toContain(permission);
    }
  });

  it('gives the owner every permission', () => {
    expect(ROLE_PERMISSIONS.owner.toSorted()).toEqual(PERMISSIONS.toSorted());
  });

  it('nests roles: each role has every permission of the roles below it', () => {
    for (let i = 1; i < ROLES.length; i++) {
      const higher = ROLE_PERMISSIONS[ROLES[i - 1]!];
      for (const permission of ROLE_PERMISSIONS[ROLES[i]!]) expect(higher).toContain(permission);
    }
  });

  it.each([
    ['viewer', 'document:upload', false],
    ['viewer', 'document:delete:own', false],
    ['viewer', 'analysis:run', true],
    ['member', 'document:delete:own', true],
    ['member', 'document:delete:any', false],
    ['member', 'audit:read', false],
    ['admin', 'member:manage', true],
    ['admin', 'organization:delete', false],
    ['owner', 'organization:delete', true],
  ] as const)('%s has %s: %s', (role, permission, expected) => {
    expect(hasPermission(role, permission)).toBe(expected);
  });
});

describe('isRole', () => {
  it('accepts known roles only', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe('toPermissionStatements', () => {
  it('groups actions by resource, keeping multi-part actions intact', () => {
    expect(toPermissionStatements(ROLE_PERMISSIONS.member)).toEqual({
      document: ['read', 'upload', 'delete:own'],
      analysis: ['run'],
    });
  });
});
