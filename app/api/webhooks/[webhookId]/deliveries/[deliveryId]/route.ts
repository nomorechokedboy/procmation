import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhookAttempts, webhookDeliveries } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";

// GET - one delivery with the payload sent and what each attempt got back
export async function GET(
  request: Request,
  { params }: { params: Promise<{ webhookId: string; deliveryId: string }> }
) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { deliveryId, webhookId } = await params;
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.endpointId, webhookId)
      )
    )
    .limit(1);
  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  const attempts = await db
    .select()
    .from(webhookAttempts)
    .where(eq(webhookAttempts.deliveryId, deliveryId))
    .orderBy(asc(webhookAttempts.attempt), asc(webhookAttempts.createdAt));
  return NextResponse.json({ attempts, delivery });
}
