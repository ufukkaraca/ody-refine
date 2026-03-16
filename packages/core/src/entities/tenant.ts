/**
 * Tenant context — canonical type used by all clients after auth.
 * The single source of truth for "who is this request acting as?"
 */
export interface TenantContext {
  orgId: string;
  userId: string;
  tokenType: 'session' | 'bearer' | 'native' | 'widget' | 'service';
  sessionId?: string;
}

export type DeploymentMode = 'saas' | 'on-prem';

export interface TenantConfig {
  mode: DeploymentMode;
  /** Required when mode === 'on-prem' */
  singleOrgId?: string;
}
