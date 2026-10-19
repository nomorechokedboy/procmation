import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/session";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ inviteId: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { inviteId } = await params;
  const deleted = await db
    .delete(invitations)
    .where(and(eq(invitations.id, inviteId), isNull(invitations.acceptedAt)))
    .returning({ email: invitations.email, id: invitations.id });

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Pending invitation not found" },
      { status: 404 }
    );
  }

  recordAudit({
    action: "revoked",
    actor: userActor(guard.user),
    resourceId: inviteId,
    resourceLabel: deleted[0].email,
    resourceType: AUDIT_RESOURCES.invite,
    summary: `${guard.user.name} revoked the invitation for ${deleted[0].email}`,
  });

  return NextResponse.json({ success: true });
}
