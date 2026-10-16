import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
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
    .returning({ id: invitations.id });

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Pending invitation not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
