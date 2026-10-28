import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { webhookEndpoints } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";
import {
  generateWebhookSecret,
  parseEndpointInput,
  publicEndpoint,
} from "@/lib/webhooks/input";

type Params = { params: Promise<{ webhookId: string }> };

// PATCH - any of name, url, events, processIds, format, enabled, and
// rotateSecret: true for a new secret (returned once). Turning an endpoint
// back on clears its failure count.
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { webhookId } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const [current] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, webhookId));
  if (!current) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }
  const parsed = await parseEndpointInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const rotated = body.rotateSecret === true ? generateWebhookSecret() : null;
  const turnedOn = parsed.values.enabled === true && !current.enabled;
  const updates = {
    ...parsed.values,
    ...(rotated ? { secret: rotated } : {}),
    ...(turnedOn ? { disabledReason: null, failureCount: 0 } : {}),
    ...(parsed.values.enabled === false ? { disabledReason: null } : {}),
  };
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const [updated] = await db
    .update(webhookEndpoints)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(webhookEndpoints.id, webhookId))
    .returning();

  recordAudit({
    action: rotated ? "secret_rotated" : "updated",
    actor: userActor(guard.user),
    metadata: { changed: Object.keys(parsed.values) },
    resourceId: webhookId,
    resourceLabel: updated.name,
    resourceType: AUDIT_RESOURCES.webhook,
    summary: `${guard.user.name || guard.user.email} ${
      rotated ? "rotated the secret of" : "updated"
    } the webhook ${updated.name}`,
  });
  return NextResponse.json({
    ...publicEndpoint(updated),
    ...(rotated ? { secret: rotated } : {}),
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { webhookId } = await params;
  const [removed] = await db
    .delete(webhookEndpoints)
    .where(eq(webhookEndpoints.id, webhookId))
    .returning({ id: webhookEndpoints.id, name: webhookEndpoints.name });
  if (!removed) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }
  recordAudit({
    action: "deleted",
    actor: userActor(guard.user),
    resourceId: removed.id,
    resourceLabel: removed.name,
    resourceType: AUDIT_RESOURCES.webhook,
    summary: `${guard.user.name || guard.user.email} deleted the webhook ${removed.name}`,
  });
  return NextResponse.json({ success: true });
}
