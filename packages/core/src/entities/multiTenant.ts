/**
 * Organization entity - top-level multi-tenant container
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Organization role - user's role within an organization
 */
export type OrgRole = "admin" | "member" | "guest";

/**
 * Vault member role - user's role within a specific vault
 */
export type VaultMemberRole = "owner" | "editor" | "viewer";

/**
 * VaultMember - junction between user and vault with role
 */
export interface VaultMember {
  id: string;
  vaultId: string;
  userId: string;
  role: VaultMemberRole;
  joinedAt: Date;
  invitedBy?: string;
}

/**
 * PersonalVault - auto-created vault per user in an org
 */
export interface PersonalVault {
  id: string;
  userId: string;
  orgId: string;
  createdAt: Date;
}

/**
 * OrgInvitation - pending invitation to join organization
 */
export interface OrgInvitation {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  token: string;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}
