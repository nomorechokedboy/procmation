import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import {
  generateInviteToken,
  INVITE_TTL_MS,
  normalizeEmail,
} from "@/lib/auth-provision";
import { db } from "@/lib/db";
import { invitations, users } from "@/lib/db/schema";
import { sendInviteEmail } from "@/lib/email/invite";
import { MEMBER_ROLE } from "@/lib/permissions";
import { roleExists } from "@/lib/roles";
import { requireAdmin, requirePermission } from "@/lib/session";

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const rows = await db
    .select({
      acceptedAt: invitations.acceptedAt,
      createdAt: invitations.createdAt,
      email: invitations.email,
      expiresAt: invitations.expiresAt,
      id: invitations.id,
      role: invitations.role,
    })
    .from(invitations)
    .orderBy(desc(invitations.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const guard = await requirePermission(request, "members.manage");
  if (!guard.ok) {
    return guard.response;
  }

  const body = (await request.json()) as { email?: string; role?: string };
  const email = body.email ? normalizeEmail(body.email) : "";
  const role = body.role ?? MEMBER_ROLE;

  if (!email.includes("@")) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 }
    );
  }
  if (!(await roleExists(role))) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  // Inviting someone with more than the default role is handing out access
  if (
    role !== MEMBER_ROLE &&
    !guard.user.permissions.includes("roles.manage")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingUser) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  const { token, tokenHash } = generateInviteToken();

  const [invitation] = await db.transaction(async (tx) => {
    // Re-inviting replaces any earlier pending invitation for the same email
    await tx
      .delete(invitations)
      .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt)));

    return tx
      .insert(invitations)
      .values({
        email,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedBy: guard.user.id,
        role,
        tokenHash,
      })
      .returning({ expiresAt: invitations.expiresAt, id: invitations.id });
  });

  recordAudit({
    action: "created",
    actor: userActor(guard.user),
    metadata: { role },
    resourceId: invitation.id,
    resourceLabel: email,
    resourceType: AUDIT_RESOURCES.invite,
    summary: `${guard.user.name} invited ${email} as ${role}`,
  });

  const inviteUrl = `${getAppOrigin(request)}/invite/${token}`;
  const emailStatus = await sendInviteEmail({
    expiresAt: invitation.expiresAt,
    inviterName: guard.user.name || guard.user.email,
    inviteUrl,
    role,
    to: email,
  });

  return NextResponse.json({
    email,
    emailStatus,
    expiresAt: invitation.expiresAt,
    id: invitation.id,
    inviteUrl,
    role,
  });
}
