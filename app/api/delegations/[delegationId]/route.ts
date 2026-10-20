import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { delegations } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ delegationId: string }> };

// DELETE /api/delegations/:id - ends it now. Tasks it already moved stay
// where they are. The person away, or someone with members.manage, can do it.
export async function DELETE(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { delegationId } = await params;
  const [found] = await db
    .select()
    .from(delegations)
    .where(eq(delegations.id, delegationId));
  const allowed =
    found &&
    (found.fromUserId === guard.user.id ||
      guard.user.permissions.includes("members.manage"));
  if (!(found && allowed)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [revoked] = await db
    .update(delegations)
    .set({ revokedAt: new Date() })
    .where(and(eq(delegations.id, found.id), isNull(delegations.revokedAt)))
    .returning();
  if (!revoked) {
    return NextResponse.json({ error: "Already ended" }, { status: 409 });
  }

  recordAudit([
    {
      action: "revoked",
      actor: userActor(guard.user),
      resourceId: found.id,
      resourceLabel: "Delegation",
      resourceType: AUDIT_RESOURCES.delegation,
      summary: `${guard.user.name} ended a delegation`,
    },
  ]);

  return NextResponse.json({ success: true });
}
