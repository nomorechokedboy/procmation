import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhookDeliveries, webhookEndpoints } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";
import { attemptDelivery } from "@/lib/webhooks/dispatch";

// POST - sends a past delivery again, with the same event id, and says how
// the endpoint answered. Not retried if it fails again.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ webhookId: string; deliveryId: string }> }
) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { webhookId, deliveryId } = await params;
  const [row] = await db
    .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
    .from(webhookDeliveries)
    .innerJoin(
      webhookEndpoints,
      eq(webhookEndpoints.id, webhookDeliveries.endpointId)
    )
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.endpointId, webhookId)
      )
    );
  if (!row) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  // Marking it as out of attempts first makes a second failure final
  const result = await attemptDelivery(row.endpoint, {
    ...row.delivery,
    attempts: 5,
  });
  return NextResponse.json({
    error: result.error ?? null,
    ok: result.ok,
    status: result.status ?? null,
  });
}
