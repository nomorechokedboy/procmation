import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";
import { AUDIT_RESOURCES, recordAudit } from "@/lib/audit";
import { normalizeEmail } from "@/lib/auth-provision";
import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";
import { roleExists } from "@/lib/roles";
import { canAutoJoin, getSsoConfig } from "@/lib/sso-config";

export type JoinDecision =
  | { allowed: true; role: string; via: "invitation" | "domain" }
  | { allowed: false };

// Who may create an account by signing in with SSO for the first time: people
// with a pending invitation (they get the invited role) and, when an admin
// listed the domain, anyone at that domain (they get the default role).
// Everybody else is turned away, so the app stays closed to strangers.
export async function decideJoin(rawEmail: string): Promise<JoinDecision> {
  const config = getSsoConfig();
  if (!config) {
    return { allowed: false };
  }
  const email = normalizeEmail(rawEmail);

  const [invite] = await db
    .select({ role: invitations.role })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date())
      )
    )
    .limit(1);
  if (invite) {
    return { allowed: true, role: invite.role, via: "invitation" };
  }

  if (canAutoJoin(config, email)) {
    const role = (await roleExists(config.defaultRole))
      ? config.defaultRole
      : "member";
    return { allowed: true, role, via: "domain" };
  }
  return { allowed: false };
}

// Called once the account exists: uses up the invitation and records the join
export async function finishJoin(user: {
  id: string;
  email: string;
  name: string;
  role?: string | null;
}) {
  const email = normalizeEmail(user.email);
  const claimed = await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt)))
    .returning({ id: invitations.id });
  const via = claimed.length > 0 ? "an invitation" : "their email domain";
  const label = user.name || user.email;
  recordAudit({
    action: "joined",
    actor: { id: user.id, name: label },
    metadata: { method: "sso", role: user.role },
    resourceId: user.id,
    resourceLabel: label,
    resourceType: AUDIT_RESOURCES.member,
    summary: `${label} joined as ${user.role ?? "member"} with SSO through ${via}`,
  });
}
