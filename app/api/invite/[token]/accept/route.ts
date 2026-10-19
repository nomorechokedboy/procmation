import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AUDIT_RESOURCES, type AuditEntry, recordAudit } from "@/lib/audit";
import {
  createCredentialUser,
  hashInviteToken,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth-provision";
import { db } from "@/lib/db";
import { invitations, users } from "@/lib/db/schema";

class InviteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Public: the invitee sets their name and password, which creates the account
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = (await request.json()) as { name?: string; password?: string };
    const name = body.name?.trim();
    const password = body.password ?? "";

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    const audits: AuditEntry[] = [];
    const email = await db.transaction(async (tx) => {
      // Claiming the invitation is a single conditional update, so two
      // concurrent accepts cannot both succeed
      const [claimed] = await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(
          and(
            eq(invitations.tokenHash, hashInviteToken(token)),
            isNull(invitations.acceptedAt),
            gt(invitations.expiresAt, new Date())
          )
        )
        .returning({ email: invitations.email, role: invitations.role });

      if (!claimed) {
        throw new InviteError("This invitation is invalid or has expired", 410);
      }

      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, claimed.email))
        .limit(1);
      if (existingUser) {
        throw new InviteError("An account with this email already exists", 409);
      }

      const newUserId = await createCredentialUser(tx, {
        email: claimed.email,
        name,
        password,
        role: claimed.role,
      });
      audits.push({
        action: "joined",
        actor: { id: newUserId, name: name || claimed.email },
        metadata: { role: claimed.role },
        resourceId: newUserId,
        resourceLabel: name || claimed.email,
        resourceType: AUDIT_RESOURCES.member,
        summary: `${name || claimed.email} accepted the invitation and joined as ${claimed.role}`,
      });

      return claimed.email;
    });
    recordAudit(audits);

    return NextResponse.json({ email, success: true });
  } catch (error) {
    if (error instanceof InviteError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Failed to accept invitation:", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
