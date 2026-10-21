// What a role can be allowed to do. The list lives in code, because a
// permission only means something where a route or page checks for it; admins
// choose which of these each role gets, in Admin > Roles.
export const PERMISSIONS = [
  "reports.view",
  "audit.view",
  "cases.view_all",
  "team.view",
  "processes.manage",
  "members.manage",
  "roles.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// The two roles every installation has. Admin always holds every permission
// and member holds none, so neither can be edited or deleted.
export const ADMIN_ROLE = "admin";
export const MEMBER_ROLE = "member";

export function isPermission(value: unknown): value is Permission {
  return (PERMISSIONS as readonly unknown[]).includes(value);
}
