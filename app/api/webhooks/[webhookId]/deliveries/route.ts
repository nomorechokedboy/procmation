import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhookDeliveries } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";

const LIMIT = 50;

// GET - the latest deliveries to this endpoint, newest first
export async function GET(
  request: Request,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { webhookId } = await params;
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.endpointId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(LIMIT);
  return NextResponse.json(rows);
}
