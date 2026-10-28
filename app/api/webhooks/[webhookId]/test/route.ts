import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhookDeliveries, webhookEndpoints } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";
import { attemptDelivery } from "@/lib/webhooks/dispatch";

// POST - sends a "ping" event now and says how the endpoint answered. It
// is not retried, and works even while the endpoint is switched off.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { webhookId } = await params;
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, webhookId));
  if (!endpoint) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }
  const eventId = crypto.randomUUID();
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      attempts: 5,
      endpointId: endpoint.id,
      eventId,
      eventType: "ping",
      payload: {
        createdAt: new Date().toISOString(),
        data: { message: "This is a test from Procmation" },
        id: eventId,
        type: "ping",
      },
    })
    .returning();
  // attempts starts high so a failed test is final instead of queued for retry
  const result = await attemptDelivery(endpoint, delivery);
  return NextResponse.json({
    error: result.error ?? null,
    ok: result.ok,
    response: result.body ?? null,
    status: result.status ?? null,
  });
}
