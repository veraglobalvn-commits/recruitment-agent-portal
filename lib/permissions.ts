export const PERMISSIONS = {
  // Order visibility
  VIEW_ALL_ORDERS: 'view_all_orders',
  VIEW_AGENCY_ORDERS: 'view_agency_orders',
  VIEW_ASSIGNED_ORDERS: 'view_assigned_orders',
  // Candidate operations
  VIEW_ALL_CANDIDATES: 'view_all_candidates',
  ADD_CANDIDATES: 'add_candidates',
  EDIT_CANDIDATES: 'edit_candidates',
  DELETE_CANDIDATES: 'delete_candidates',
  INTERVIEW_CANDIDATES: 'interview_candidates',
  // Team management
  MANAGE_TEAM: 'manage_team',
  VIEW_TEAM: 'view_team',
  // Financial
  VIEW_PAYMENTS: 'view_payments',
  MANAGE_PAYMENTS: 'manage_payments',
  // Company
  VIEW_COMPANIES: 'view_companies',
  EDIT_COMPANIES: 'edit_companies',
  // Admin
  MANAGE_POLICY: 'manage_policy',
  MANAGE_USERS: 'manage_users',
} as const;

// Admin-side roles: access /admin portal
// Agent-side roles: access / agent portal
export type UserRole = 'admin' | 'operator' | 'read_only' | 'agent' | 'member';

export const ADMIN_ROLES: UserRole[] = ['admin', 'operator', 'read_only'];
export const AGENT_ROLES: UserRole[] = ['agent', 'member'];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // === ADMIN PORTAL ROLES ===
  // Full access to everything
  admin: Object.values(PERMISSIONS),

  // Add + edit all data, cannot delete
  operator: [
    PERMISSIONS.VIEW_ALL_ORDERS,
    PERMISSIONS.VIEW_ALL_CANDIDATES,
    PERMISSIONS.VIEW_COMPANIES,
    PERMISSIONS.VIEW_PAYMENTS,
    PERMISSIONS.ADD_CANDIDATES,
    PERMISSIONS.EDIT_CANDIDATES,
    PERMISSIONS.INTERVIEW_CANDIDATES,
    PERMISSIONS.EDIT_COMPANIES,
    PERMISSIONS.MANAGE_USERS,
  ],

  // Read-only access to everything
  read_only: [
    PERMISSIONS.VIEW_ALL_ORDERS,
    PERMISSIONS.VIEW_ALL_CANDIDATES,
    PERMISSIONS.VIEW_COMPANIES,
    PERMISSIONS.VIEW_PAYMENTS,
  ],

  // === AGENT PORTAL ROLES ===
  // Team owner — full agent permissions
  agent: [
    PERMISSIONS.VIEW_AGENCY_ORDERS,
    PERMISSIONS.ADD_CANDIDATES,
    PERMISSIONS.EDIT_CANDIDATES,
    PERMISSIONS.DELETE_CANDIDATES,
    PERMISSIONS.INTERVIEW_CANDIDATES,
    PERMISSIONS.MANAGE_TEAM,
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.VIEW_PAYMENTS,
    PERMISSIONS.VIEW_COMPANIES,
  ],

  // Team member — add + edit candidates only
  member: [
    PERMISSIONS.VIEW_ASSIGNED_ORDERS,
    PERMISSIONS.ADD_CANDIDATES,
    PERMISSIONS.EDIT_CANDIDATES,
  ],

  // Legacy alias — kept for backward compat during migration
  manager: [
    PERMISSIONS.VIEW_ASSIGNED_ORDERS,
    PERMISSIONS.ADD_CANDIDATES,
    PERMISSIONS.EDIT_CANDIDATES,
  ],
};

export function hasPermission(
  user: { role: string | null; permissions?: string[] | null },
  permission: string,
): boolean {
  if (!user.role) return false;
  const customPerms = user.permissions;
  if (customPerms && customPerms.length > 0) {
    return customPerms.includes(permission);
  }
  return (ROLE_PERMISSIONS[user.role] || []).includes(permission);
}

export function isAdminRole(role: string | null): boolean {
  return ADMIN_ROLES.includes(role as UserRole);
}

export function isAgentRole(role: string | null): boolean {
  return AGENT_ROLES.includes(role as UserRole);
}
