import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { UserRole } from "@/lib/db/schema";
import { ADMIN_ROLE, type Permission } from "@/lib/permissions";
import { permissionsForRole } from "@/lib/roles";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
};

type GuardResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

export async function requireUser(request: Request): Promise<GuardResult> {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const role = (session.user as { role?: UserRole }).role ?? "member";

  return {
    ok: true,
    user: {
      email: session.user.email,
      id: session.user.id,
      name: session.user.name,
      permissions: await permissionsForRole(role),
      role,
    },
  };
}

export async function requireAdmin(request: Request): Promise<GuardResult> {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard;
  }

  if (guard.user.role !== ADMIN_ROLE) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return guard;
}

// Signed in and allowed to do one thing, such as view reports
export async function requirePermission(
  request: Request,
  permission: Permission
): Promise<GuardResult> {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard;
  }
  if (!guard.user.permissions.includes(permission)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return guard;
}

// For routes that do their own sign-in handling: a 401/403 response when the
// caller may not do this, otherwise null
export async function denyWithoutPermission(
  request: Request,
  permission: Permission
): Promise<NextResponse | null> {
  const guard = await requirePermission(request, permission);
  return guard.ok ? null : guard.response;
}
