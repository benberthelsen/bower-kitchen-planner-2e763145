/**
 * An account can hold several app_role rows (admin and staff, say). useAuth
 * used to read them with .single(), which fails on a second row, so the
 * accounts with the most access lost isAdmin. Every row is read now and the
 * flags come from the whole set.
 */
export type AppRole = 'admin' | 'moderator' | 'user' | 'staff';

// Most access first: userRole is the first role held in this order.
const ROLE_ORDER: readonly AppRole[] = ['admin', 'staff', 'moderator', 'user'];

export interface ResolvedRoles {
  roles: AppRole[];
  isAdmin: boolean;
  userRole: AppRole | null;
}

export function resolveRoles(rows: ReadonlyArray<{ role?: unknown }> | null | undefined): ResolvedRoles {
  const held = new Set<unknown>((rows ?? []).map((row) => row?.role));
  const roles = ROLE_ORDER.filter((role) => held.has(role));
  return { roles, isAdmin: held.has('admin'), userRole: roles[0] ?? null };
}
