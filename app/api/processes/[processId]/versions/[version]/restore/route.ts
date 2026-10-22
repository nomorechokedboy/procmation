import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  processDefinitions,
  processVersions,
  workflows,
} from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";

// POST /api/processes/:id/versions/:version/restore
// Copies an old version back into the draft. Nothing is published: the person
// reviews it in the editor and publishes it as the next version.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ processId: string; version: string }> }
) {
  const guard = await requirePermission(request, "processes.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { processId, version } = await params;
  const number = Number(version);
  const [row] = Number.isInteger(number)
    ? await db
        .select()
        .from(processVersions)
        .where(
          and(
            eq(processVersions.definitionId, processId),
            eq(processVersions.version, number)
          )
        )
    : [];
  if (!row) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const [definition] = await db
    .select({ workflowId: processDefinitions.workflowId })
    .from(processDefinitions)
    .where(eq(processDefinitions.id, processId));
  if (!definition) {
    return NextResponse.json({ error: "Process not found" }, { status: 404 });
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(workflows)
      .set({
        description: row.description,
        edges: row.edges,
        name: row.name,
        nodes: row.nodes,
        updatedAt: now,
      })
      .where(eq(workflows.id, definition.workflowId));
    await tx
      .update(processDefinitions)
      .set({ startFormFields: row.startFormFields, updatedAt: now })
      .where(eq(processDefinitions.id, processId));
  });

  const actorName = guard.user.name || guard.user.email;
  recordAudit({
    action: "version_restored",
    actor: userActor(guard.user),
    metadata: { version: number },
    resourceId: processId,
    resourceLabel: row.name,
    resourceType: AUDIT_RESOURCES.process,
    summary: `${actorName} restored version ${number} of the process ${row.name} as the draft`,
  });

  return NextResponse.json({ restored: number });
}
