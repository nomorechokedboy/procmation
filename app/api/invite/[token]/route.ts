import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/auth-provision";
import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";

// Public: lets the invitation page show who is being invited before accepting
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const [invitation] = await db
    .select({ email: invitations.email, role: invitations.role })
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, hashInviteToken(token)),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!invitation) {
    return NextResponse.json(
      { error: "This invitation is invalid or has expired" },
      { status: 404 }
    );
  }

  return NextResponse.json(invitation);
}
