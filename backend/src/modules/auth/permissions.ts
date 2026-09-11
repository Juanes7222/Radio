import {
  ADMIN_PERMISSIONS,
  type AdminPermission,
  type AdminRole,
} from "@radio/types";

export type { AdminPermission, AdminRole };
export { ADMIN_PERMISSIONS };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  if (!EMAIL_PATTERN.test(email)) return false;
  if (email.length > 254) return false;
  return true;
}

export function parsePermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<string>(ADMIN_PERMISSIONS);
  const seen = new Set<string>();
  const out: AdminPermission[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (!valid.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key as AdminPermission);
  }
  return out;
}

export function effectivePermissions(
  role: AdminRole,
  stored: AdminPermission[]
): AdminPermission[] {
  if (role === "SUPERADMIN") return [...ADMIN_PERMISSIONS];
  if (role === "ADMIN") return ADMIN_PERMISSIONS.filter((p) => p !== "users");
  return parsePermissions(stored);
}

export function hasPermission(
  role: AdminRole,
  permissions: AdminPermission[],
  permission: AdminPermission
): boolean {
  if (role === "SUPERADMIN") return true;
  if (role === "ADMIN") return permission !== "users";
  return permissions.includes(permission);
}

export function isAdminRole(value: unknown): value is AdminRole {
  return value === "SUPERADMIN" || value === "ADMIN" || value === "USER";
}
