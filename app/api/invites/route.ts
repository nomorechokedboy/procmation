import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import {
  generateInviteToken,
  INVITE_TTL_MS,
  normalizeEmail,
} from "@/lib/auth-provision";
import { db } from "@/lib/db";
import { invitations, type UserRole, users } from "@/lib/db/schema";
import { sendInviteEmail } from "@/lib/email/invite";
import { requireAdmin } from "@/lib/session";

const ROLES: UserRole[] = ["admin", "member"];

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
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = (await request.json()) as { email?: string; role?: UserRole };
  const email = body.email ? normalizeEmail(body.email) : "";
  const role = body.role ?? "member";

  if (!email.includes("@")) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 }
    );
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
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
