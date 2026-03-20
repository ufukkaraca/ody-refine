import { describe, it, expect } from 'vitest';
import {
  canAccessVault,
  canAccessReserve,
  canManageOrg,
  canInviteToOrg,
  getRequiredVaultRole,
  compareVaultRoles,
  hasAtLeastRole,
} from '../policies/rbac.js';
import type { VaultMember, User, VaultMemberRole } from '../entities/index.js';

function member(role: VaultMemberRole): VaultMember {
  return { userId: 'u1', vaultId: 'v1', role } as VaultMember;
}

function orgUser(role: 'admin' | 'member', orgId: string): User {
  return { id: 'u1', orgId, role } as User;
}

describe('canAccessVault', () => {
  it('returns false for null membership', () => {
    expect(canAccessVault(null, 'view')).toBe(false);
    expect(canAccessVault(null, 'edit')).toBe(false);
    expect(canAccessVault(null, 'delete')).toBe(false);
  });

  it('owner can perform all actions', () => {
    const m = member('owner');
    expect(canAccessVault(m, 'view')).toBe(true);
    expect(canAccessVault(m, 'edit')).toBe(true);
    expect(canAccessVault(m, 'delete')).toBe(true);
    expect(canAccessVault(m, 'invite')).toBe(true);
    expect(canAccessVault(m, 'manage_members')).toBe(true);
  });

  it('editor can view, edit, invite but not delete or manage', () => {
    const m = member('editor');
    expect(canAccessVault(m, 'view')).toBe(true);
    expect(canAccessVault(m, 'edit')).toBe(true);
    expect(canAccessVault(m, 'invite')).toBe(true);
    expect(canAccessVault(m, 'delete')).toBe(false);
    expect(canAccessVault(m, 'manage_members')).toBe(false);
  });

  it('viewer can only view', () => {
    const m = member('viewer');
    expect(canAccessVault(m, 'view')).toBe(true);
    expect(canAccessVault(m, 'edit')).toBe(false);
    expect(canAccessVault(m, 'delete')).toBe(false);
    expect(canAccessVault(m, 'invite')).toBe(false);
    expect(canAccessVault(m, 'manage_members')).toBe(false);
  });
});

describe('canAccessReserve', () => {
  it('returns false for null membership', () => {
    expect(canAccessReserve(null, 'view')).toBe(false);
  });

  it('owner can CRUD', () => {
    const m = member('owner');
    expect(canAccessReserve(m, 'view')).toBe(true);
    expect(canAccessReserve(m, 'create')).toBe(true);
    expect(canAccessReserve(m, 'edit')).toBe(true);
    expect(canAccessReserve(m, 'delete')).toBe(true);
  });

  it('editor can view, create, edit but not delete', () => {
    const m = member('editor');
    expect(canAccessReserve(m, 'view')).toBe(true);
    expect(canAccessReserve(m, 'create')).toBe(true);
    expect(canAccessReserve(m, 'edit')).toBe(true);
    expect(canAccessReserve(m, 'delete')).toBe(false);
  });

  it('viewer can only view', () => {
    const m = member('viewer');
    expect(canAccessReserve(m, 'view')).toBe(true);
    expect(canAccessReserve(m, 'create')).toBe(false);
    expect(canAccessReserve(m, 'edit')).toBe(false);
    expect(canAccessReserve(m, 'delete')).toBe(false);
  });
});

describe('canManageOrg', () => {
  it('allows admin of same org', () => {
    expect(canManageOrg(orgUser('admin', 'org1'), 'org1')).toBe(true);
  });

  it('denies member role', () => {
    expect(canManageOrg(orgUser('member', 'org1'), 'org1')).toBe(false);
  });

  it('denies admin of different org', () => {
    expect(canManageOrg(orgUser('admin', 'org1'), 'org2')).toBe(false);
  });
});

describe('canInviteToOrg', () => {
  it('allows admin', () => {
    expect(canInviteToOrg(orgUser('admin', 'org1'), 'org1')).toBe(true);
  });

  it('allows member', () => {
    expect(canInviteToOrg(orgUser('member', 'org1'), 'org1')).toBe(true);
  });

  it('denies cross-org', () => {
    expect(canInviteToOrg(orgUser('admin', 'org1'), 'org2')).toBe(false);
  });
});

describe('getRequiredVaultRole', () => {
  it('returns viewer for view', () => {
    expect(getRequiredVaultRole('view')).toBe('viewer');
  });

  it('returns editor for edit and invite', () => {
    expect(getRequiredVaultRole('edit')).toBe('editor');
    expect(getRequiredVaultRole('invite')).toBe('editor');
  });

  it('returns owner for delete and manage_members', () => {
    expect(getRequiredVaultRole('delete')).toBe('owner');
    expect(getRequiredVaultRole('manage_members')).toBe('owner');
  });
});

describe('compareVaultRoles', () => {
  it('orders viewer < editor < owner', () => {
    expect(compareVaultRoles('viewer', 'editor')).toBeLessThan(0);
    expect(compareVaultRoles('editor', 'owner')).toBeLessThan(0);
    expect(compareVaultRoles('viewer', 'owner')).toBeLessThan(0);
  });

  it('returns 0 for same role', () => {
    expect(compareVaultRoles('editor', 'editor')).toBe(0);
  });

  it('returns positive when first role is higher', () => {
    expect(compareVaultRoles('owner', 'viewer')).toBeGreaterThan(0);
  });
});

describe('hasAtLeastRole', () => {
  it('owner has at least viewer', () => {
    expect(hasAtLeastRole('owner', 'viewer')).toBe(true);
  });

  it('viewer does not have at least editor', () => {
    expect(hasAtLeastRole('viewer', 'editor')).toBe(false);
  });

  it('same role is sufficient', () => {
    expect(hasAtLeastRole('editor', 'editor')).toBe(true);
  });
});
