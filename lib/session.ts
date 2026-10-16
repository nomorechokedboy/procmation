import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { UserRole } from "@/lib/db/schema";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
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
      role,
    },
  };
}

export async function requireAdmin(request: Request): Promise<GuardResult> {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard;
  }

  if (guard.user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return guard;
}
