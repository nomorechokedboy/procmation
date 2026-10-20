import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { processSummarySelection } from "@/lib/db/process-queries";
import {
  type ProcessDefinitionStatus,
  processDefinitions,
  workflows,
} from "@/lib/db/schema";
import { validateFormFields } from "@/lib/process-form-validation";
import { requirePermission, requireUser } from "@/lib/session";

const MAX_CATEGORY_LENGTH = 60;

const ALLOWED_TRANSITIONS: Record<
  ProcessDefinitionStatus,
  ProcessDefinitionStatus[]
> = {
  archived: ["draft"],
  draft: ["published", "archived"],
  published: ["draft", "archived"],
};

async function loadSummary(processId: string) {
  const [row] = await db
    .select(processSummarySelection)
    .from(processDefinitions)
    .innerJoin(workflows, eq(processDefinitions.workflowId, workflows.id))
    .where(eq(processDefinitions.id, processId))
    .limit(1);
  return row;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ processId: string }> }
) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { processId } = await params;
  const process = await loadSummary(processId);

  // Members get the same answer for a missing process and an unpublished one
  if (
    !process ||
    (!guard.user.permissions.includes("processes.manage") &&
      process.status !== "published")
  ) {
    return NextResponse.json({ error: "Process not found" }, { status: 404 });
  }

  return NextResponse.json(process);
}

// An error message when the workflow is not ready to publish, nothing when it is
async function checkCanPublish(
  workflowId: string
): Promise<string | undefined> {
  const [workflow] = await db
    .select({ nodes: workflows.nodes })
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);
  const hasTrigger = (workflow?.nodes ?? []).some(
    (node) => node?.data?.type === "trigger"
  );
  return hasTrigger
    ? undefined
    : "Add a trigger step to the workflow before publishing";
}

type ProcessUpdates = Partial<typeof processDefinitions.$inferInsert>;

function auditProcessChange(
  user: { id: string; name: string; email: string },
  current: { name: string; status: string },
  processId: string,
  updates: ProcessUpdates
) {
  const statusChanged = updates.status !== undefined;
  const actorName = user.name || user.email;
  recordAudit({
    action: statusChanged ? `status_${updates.status}` : "updated",
    actor: userActor(user),
    metadata: {
      changed: Object.keys(updates),
      ...(statusChanged ? { from: current.status, to: updates.status } : {}),
    },
    resourceId: processId,
    resourceLabel: current.name,
    resourceType: AUDIT_RESOURCES.process,
    summary: statusChanged
      ? `${actorName} changed the process ${current.name} from ${current.status} to ${updates.status}`
      : `${actorName} updated the process ${current.name}`,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ processId: string }> }
) {
  const guard = await requirePermission(request, "processes.manage");
  if (!guard.ok) {
    return guard.response;
  }

  const { processId } = await params;
  const body = (await request.json()) as {
    status?: ProcessDefinitionStatus;
    category?: string | null;
    startFormFields?: unknown;
  };

  const current = await loadSummary(processId);
  if (!current) {
    return NextResponse.json({ error: "Process not found" }, { status: 404 });
  }

  const updates: Partial<typeof processDefinitions.$inferInsert> = {};

  if (body.category !== undefined) {
    const category = body.category?.trim() || null;
    if (category && category.length > MAX_CATEGORY_LENGTH) {
      return NextResponse.json(
        { error: `Category must be at most ${MAX_CATEGORY_LENGTH} characters` },
        { status: 400 }
      );
    }
    updates.category = category;
  }

  if (body.startFormFields !== undefined) {
    const fields = validateFormFields(body.startFormFields);
    if (!fields.ok) {
      return NextResponse.json({ error: fields.error }, { status: 400 });
    }
    updates.startFormFields = fields.fields;
  }

  if (body.status !== undefined && body.status !== current.status) {
    if (!ALLOWED_TRANSITIONS[current.status].includes(body.status)) {
      return NextResponse.json(
        { error: `A ${current.status} process cannot become ${body.status}` },
        { status: 409 }
      );
    }

    if (body.status === "published") {
      const publishError = await checkCanPublish(current.workflowId);
      if (publishError) {
        return NextResponse.json({ error: publishError }, { status: 409 });
      }
      updates.publishedAt = new Date();
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db
    .update(processDefinitions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(processDefinitions.id, processId));

  auditProcessChange(
    guard.user,
    { name: current.name, status: current.status },
    processId,
    updates
  );

  return NextResponse.json(await loadSummary(processId));
}
