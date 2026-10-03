import { describe, expect, it } from 'vitest';

import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '@repo/contracts';

import { can, canDeleteDocument, parseRole } from './permissions';

describe('parseRole', () => {
  it('resolves single, multiple and unknown roles', () => {
    expect(parseRole('admin')).toBe('admin');
    expect(parseRole('member, admin')).toBe('admin');
    expect(parseRole('superuser')).toBeNull();
    expect(parseRole(undefined)).toBeNull();
  });
});

describe('can', () => {
  it('matches ROLE_PERMISSIONS for every role and permission', () => {
    for (const role of ROLES) {
      for (const permission of PERMISSIONS) {
        expect(can(role, permission)).toBe(ROLE_PERMISSIONS[role].includes(permission));
      }
    }
  });

  it('grants nothing without a role', () => {
    expect(PERMISSIONS.some((permission) => can(null, permission))).toBe(false);
  });
});

describe('canDeleteDocument', () => {
  const own = { id: 'user-1' };
  const other = { id: 'user-2' };

  it('lets members delete only their own documents', () => {
    expect(canDeleteDocument('member', 'user-1', own)).toBe(true);
    expect(canDeleteDocument('member', 'user-1', other)).toBe(false);
    expect(canDeleteDocument('member', 'user-1', null)).toBe(false);
  });

  it('lets owners and admins delete any document, and viewers none', () => {
    expect(canDeleteDocument('admin', 'user-1', other)).toBe(true);
    expect(canDeleteDocument('owner', 'user-1', null)).toBe(true);
    expect(canDeleteDocument('viewer', 'user-1', own)).toBe(false);
  });
});
