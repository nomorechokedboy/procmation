import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  AUDIT_RESOURCES,
  type AuditEntry,
  recordAudit,
  userActor,
} from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ADMIN_ROLE } from "@/lib/permissions";
import { roleExists } from "@/lib/roles";
import { requirePermission } from "@/lib/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  // Changing a role changes what someone may do, so it takes roles.manage
  const guard = await requirePermission(request, "roles.manage");
  if (!guard.ok) {
    return guard.response;
  }

  const { memberId } = await params;
  const body = (await request.json()) as { role?: string };

  if (!(body.role && (await roleExists(body.role)))) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const { role } = body;

  const audits: AuditEntry[] = [];
  const result = await db.transaction(async (tx) => {
    // Lock the admin rows so two concurrent demotions cannot remove the last admin
    const admins = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, ADMIN_ROLE))
      .for("update");

    const target = await tx
      .select({
        email: users.email,
        id: users.id,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, memberId))
      .limit(1);

    if (target.length === 0) {
      return { error: "Member not found", status: 404 } as const;
    }

    const isLastAdmin =
      target[0].role === ADMIN_ROLE &&
      admins.length === 1 &&
      admins[0].id === memberId;
    if (role !== ADMIN_ROLE && isLastAdmin) {
      return {
        error: "There must be at least one admin",
        status: 409,
      } as const;
    }

    await tx
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, memberId));

    audits.push({
      action: "role_changed",
      actor: userActor(guard.user),
      metadata: { from: target[0].role, to: role },
      resourceId: memberId,
      resourceLabel: target[0].name || target[0].email,
      resourceType: AUDIT_RESOURCES.member,
      summary: `${guard.user.name} changed the role of ${target[0].name || target[0].email} from ${target[0].role} to ${role}`,
    });

    return { status: 200 } as const;
  });

  recordAudit(audits);

  if (result.status !== 200) {
    return NextResponse.json(
      { error: "error" in result ? result.error : "Failed" },
      { status: result.status }
    );
  }

  return NextResponse.json({ success: true });
}
