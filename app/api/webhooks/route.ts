import { desc, sql } from "drizzle-orm";
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

// GET /api/webhooks - endpoints with how their latest delivery went
export async function GET(request: Request) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .orderBy(desc(webhookEndpoints.createdAt));
  const latest = await db.execute<{
    endpoint_id: string;
    status: string;
    created_at: Date;
  }>(sql`
    SELECT DISTINCT ON (endpoint_id) endpoint_id, status, created_at
    FROM webhook_deliveries
    ORDER BY endpoint_id, created_at DESC
  `);
  const byEndpoint = new Map(latest.map((row) => [row.endpoint_id, row]));
  return NextResponse.json(
    endpoints.map((endpoint) => ({
      ...publicEndpoint(endpoint),
      lastDeliveryAt: byEndpoint.get(endpoint.id)?.created_at ?? null,
      lastDeliveryStatus: byEndpoint.get(endpoint.id)?.status ?? null,
    }))
  );
}

// POST /api/webhooks - body: { name, url, events[], processIds?, format? }.
// The secret is in this response only; rotate it to see a new one.
export async function POST(request: Request) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = await parseEndpointInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, url, events } = parsed.values;
  if (!(name && url && events)) {
    return NextResponse.json(
      { error: "Name, URL and events are required" },
      { status: 400 }
    );
  }
  const secret = generateWebhookSecret();
  const [created] = await db
    .insert(webhookEndpoints)
    .values({
      createdBy: guard.user.id,
      enabled: parsed.values.enabled ?? true,
      events,
      format: parsed.values.format ?? "standard",
      name,
      processIds: parsed.values.processIds ?? [],
      secret,
      url,
    })
    .returning();

  recordAudit({
    action: "created",
    actor: userActor(guard.user),
    metadata: { events, url },
    resourceId: created.id,
    resourceLabel: name,
    resourceType: AUDIT_RESOURCES.webhook,
    summary: `${guard.user.name || guard.user.email} created the webhook ${name}`,
  });
  return NextResponse.json(
    { ...publicEndpoint(created), secret },
    { status: 201 }
  );
}
