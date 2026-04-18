export const PERMISSIONS = {
  VIEW_ALL_ORDERS: 'view_all_orders',
  VIEW_AGENCY_ORDERS: 'view_agency_orders',
  VIEW_ASSIGNED_ORDERS: 'view_assigned_orders',
  ADD_CANDIDATES: 'add_candidates',
  EDIT_CANDIDATES: 'edit_candidates',
  DELETE_CANDIDATES: 'delete_candidates',
  INTERVIEW_CANDIDATES: 'interview_candidates',
  MANAGE_TEAM: 'manage_team',
  VIEW_TEAM: 'view_team',
  VIEW_PAYMENTS: 'view_payments',
  MANAGE_PAYMENTS: 'manage_payments',
  VIEW_COMPANIES: 'view_companies',
  EDIT_COMPANIES: 'edit_companies',
  MANAGE_POLICY: 'manage_policy',
  MANAGE_USERS: 'manage_users',
} as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: Object.values(PERMISSIONS),
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
  manager: [
    PERMISSIONS.VIEW_AGENCY_ORDERS,
    PERMISSIONS.ADD_CANDIDATES,
    PERMISSIONS.EDIT_CANDIDATES,
    PERMISSIONS.INTERVIEW_CANDIDATES,
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.VIEW_COMPANIES,
  ],
  operator: [
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
