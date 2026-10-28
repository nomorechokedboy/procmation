import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { getAppOrigin } from "@/lib/app-url";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  processDefinitions,
  processTriggers,
  workflows,
} from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";
import { parseTriggerInput, publicTrigger } from "@/lib/triggers/input";
import { generateTriggerToken } from "@/lib/triggers/token";
import { generateWebhookSecret } from "@/lib/webhooks/input";

type Params = { params: Promise<{ processId: string }> };

// GET - the triggers of a process
export async function GET(request: Request, { params }: Params) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { processId } = await params;
  const rows = await db
    .select()
    .from(processTriggers)
    .where(eq(processTriggers.definitionId, processId))
    .orderBy(asc(processTriggers.createdAt));
  return NextResponse.json(rows.map(publicTrigger));
}

// POST - body: { name, titlePath?, fieldMap?, requireSignature? }. The URL
// (and the signing secret, if asked for) are in this response only.
export async function POST(request: Request, { params }: Params) {
  const guard = await requirePermission(request, "integrations.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { processId } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = parseTriggerInput(body);
  if (!(parsed.ok && parsed.values.name)) {
    return NextResponse.json(
      { error: parsed.ok ? "Name is required" : parsed.error },
      { status: 400 }
    );
  }
  const [definition] = await db
    .select({
      name: workflows.name,
      startFormFields: processDefinitions.startFormFields,
    })
    .from(processDefinitions)
    .innerJoin(workflows, eq(workflows.id, processDefinitions.workflowId))
    .where(eq(processDefinitions.id, processId));
  if (!definition) {
    return NextResponse.json({ error: "Process not found" }, { status: 404 });
  }
  // A call cannot carry a file, so a required one could never be satisfied
  if (definition.startFormFields.some((f) => f.type === "file" && f.required)) {
    return NextResponse.json(
      {
        error:
          "The start form has a required file field, which a webhook cannot provide",
      },
      { status: 409 }
    );
  }

  const { token, tokenHash, tokenPrefix } = generateTriggerToken();
  const secret =
    body.requireSignature === true ? generateWebhookSecret() : null;
  const [created] = await db
    .insert(processTriggers)
    .values({
      createdBy: guard.user.id,
      definitionId: processId,
      fieldMap: parsed.values.fieldMap ?? {},
      name: parsed.values.name,
      signingSecret: secret,
      titlePath: parsed.values.titlePath ?? null,
      tokenHash,
      tokenPrefix,
    })
    .returning();

  recordAudit({
    action: "created",
    actor: userActor(guard.user),
    metadata: { process: definition.name, signed: secret !== null },
    parent: { id: processId, label: definition.name, type: "process" },
    resourceId: created.id,
    resourceLabel: created.name,
    resourceType: AUDIT_RESOURCES.trigger,
    summary: `${guard.user.name || guard.user.email} created the webhook trigger ${created.name} for ${definition.name}`,
  });
  return NextResponse.json(
    {
      ...publicTrigger(created),
      secret,
      url: `${getAppOrigin(request)}/api/hooks/${token}`,
    },
    { status: 201 }
  );
}
