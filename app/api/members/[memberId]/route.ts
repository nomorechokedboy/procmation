import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { type UserRole, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/session";

const ROLES: UserRole[] = ["admin", "member"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { memberId } = await params;
  const body = (await request.json()) as { role?: UserRole };

  if (!(body.role && ROLES.includes(body.role))) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const role = body.role;

  const result = await db.transaction(async (tx) => {
    // Lock the admin rows so two concurrent demotions cannot remove the last admin
    const admins = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .for("update");

    const target = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, memberId))
      .limit(1);

    if (target.length === 0) {
      return { status: 404, error: "Member not found" } as const;
    }

    const isLastAdmin =
      target[0].role === "admin" &&
      admins.length === 1 &&
      admins[0].id === memberId;
    if (role !== "admin" && isLastAdmin) {
      return {
        status: 409,
        error: "There must be at least one admin",
      } as const;
    }

    await tx
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, memberId));

    return { status: 200 } as const;
  });

  if (result.status !== 200) {
    return NextResponse.json(
      { error: "error" in result ? result.error : "Failed" },
      { status: result.status }
    );
  }

  return NextResponse.json({ success: true });
}
