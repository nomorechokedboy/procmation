import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { getAppOrigin } from "@/lib/app-url";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { processTriggers } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";
import { parseTriggerInput, publicTrigger } from "@/lib/triggers/input";
import { generateTriggerToken } from "@/lib/triggers/token";
import { generateWebhookSecret } from "@/lib/webhooks/input";

type Params = { params: Promise<{ triggerId: string }> };

// PATCH - any of name, titlePath, fieldMap, enabled; rotateToken: true for a
// new URL (the old one stops working at once); requireSignature: true or
// false to start or stop checking signatures. A new URL or secret is
// returned once.
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { triggerId } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = parseTriggerInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const [current] = await db
    .select()
    .from(processTriggers)
    .where(eq(processTriggers.id, triggerId));
  if (!current) {
    return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
  }

  const rotated = body.rotateToken === true ? generateTriggerToken() : null;
  let secret: string | null = null;
  const signing: { signingSecret?: string | null } = {};
  if (body.requireSignature === true && !current.signingSecret) {
    secret = generateWebhookSecret();
    signing.signingSecret = secret;
  } else if (body.requireSignature === false) {
    signing.signingSecret = null;
  }
  const updates = {
    ...parsed.values,
    ...signing,
    ...(rotated
      ? { tokenHash: rotated.tokenHash, tokenPrefix: rotated.tokenPrefix }
      : {}),
  };
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const [updated] = await db
    .update(processTriggers)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(processTriggers.id, triggerId))
    .returning();

  recordAudit({
    action: rotated ? "url_rotated" : "updated",
    actor: userActor(guard.user),
    metadata: {
      changed: Object.keys(updates).filter((k) => !k.startsWith("token")),
    },
    parent: { id: updated.definitionId, type: "process" },
    resourceId: triggerId,
    resourceLabel: updated.name,
    resourceType: AUDIT_RESOURCES.trigger,
    summary: `${guard.user.name || guard.user.email} ${
      rotated ? "gave a new URL to" : "updated"
    } the webhook trigger ${updated.name}`,
  });
  return NextResponse.json({
    ...publicTrigger(updated),
    ...(secret ? { secret } : {}),
    ...(rotated
      ? { url: `${getAppOrigin(request)}/api/hooks/${rotated.token}` }
      : {}),
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { triggerId } = await params;
  const [removed] = await db
    .delete(processTriggers)
    .where(eq(processTriggers.id, triggerId))
    .returning({
      definitionId: processTriggers.definitionId,
      id: processTriggers.id,
      name: processTriggers.name,
    });
  if (!removed) {
    return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
  }
  recordAudit({
    action: "deleted",
    actor: userActor(guard.user),
    parent: { id: removed.definitionId, type: "process" },
    resourceId: removed.id,
    resourceLabel: removed.name,
    resourceType: AUDIT_RESOURCES.trigger,
    summary: `${guard.user.name || guard.user.email} deleted the webhook trigger ${removed.name}`,
  });
  return NextResponse.json({ success: true });
}
