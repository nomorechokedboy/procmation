import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";
import {
  ADMIN_ROLE,
  isPermission,
  PERMISSIONS,
  type Permission,
} from "@/lib/permissions";

// What a role may do. Admin holds everything whatever its row says, so it can
// never be locked out; a role that no longer exists holds nothing.
export async function permissionsForRole(key: string): Promise<Permission[]> {
  if (key === ADMIN_ROLE) {
    return [...PERMISSIONS];
  }
  const [row] = await db
    .select({ permissions: roles.permissions })
    .from(roles)
    .where(eq(roles.key, key));
  return (row?.permissions ?? []).filter(isPermission);
}

export async function roleExists(key: string): Promise<boolean> {
  const [row] = await db
    .select({ key: roles.key })
    .from(roles)
    .where(eq(roles.key, key));
  return Boolean(row);
}
