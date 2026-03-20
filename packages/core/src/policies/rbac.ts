import type {
  User,
  VaultMember,
  VaultMemberRole,
} from '../entities/index.js';

/**
 * Permission actions for vault resources
 */
export type VaultAction =
  | 'view'
  | 'edit'
  | 'delete'
  | 'invite'
  | 'manage_members';

/**
 * Permission actions for reserves
 */
export type ReserveAction = 'view' | 'create' | 'edit' | 'delete';

/**
 * Check if user has permission for vault action
 */
export function canAccessVault(
  membership: VaultMember | null,
  action: VaultAction
): boolean {
  if (!membership) return false;

  const rolePermissions: Record<VaultMemberRole, VaultAction[]> = {
    owner: ['view', 'edit', 'delete', 'invite', 'manage_members'],
    editor: ['view', 'edit', 'invite'],
    viewer: ['view'],
  };

  return rolePermissions[membership.role].includes(action);
}

/**
 * Check if user has permission for reserve action
 */
export function canAccessReserve(
  membership: VaultMember | null,
  action: ReserveAction
): boolean {
  if (!membership) return false;

  const rolePermissions: Record<VaultMemberRole, ReserveAction[]> = {
    owner: ['view', 'create', 'edit', 'delete'],
    editor: ['view', 'create', 'edit'],
    viewer: ['view'],
  };

  return rolePermissions[membership.role].includes(action);
}

/**
 * Check if user can manage organization
 */
export function canManageOrg(user: User, orgId: string): boolean {
  return user.orgId === orgId && user.role === 'admin';
}

/**
 * Check if user can invite to organization
 */
export function canInviteToOrg(user: User, orgId: string): boolean {
  if (user.orgId !== orgId) return false;
  return user.role === 'admin' || user.role === 'member';
}

/**
 * Get minimum role required for an action
 */
export function getRequiredVaultRole(action: VaultAction): VaultMemberRole {
  switch (action) {
    case 'view':
      return 'viewer';
    case 'edit':
    case 'invite':
      return 'editor';
    case 'delete':
    case 'manage_members':
      return 'owner';
  }
}

/**
 * Compare vault roles (higher = more permissions)
 */
export function compareVaultRoles(
  a: VaultMemberRole,
  b: VaultMemberRole
): number {
  const order: Record<VaultMemberRole, number> = {
    viewer: 0,
    editor: 1,
    owner: 2,
  };
  return order[a] - order[b];
}

/**
 * Check if role A has at least as much permission as role B
 */
export function hasAtLeastRole(
  current: VaultMemberRole,
  required: VaultMemberRole
): boolean {
  return compareVaultRoles(current, required) >= 0;
}
