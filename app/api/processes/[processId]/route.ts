import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processSummarySelection } from "@/lib/db/process-queries";
import {
  type ProcessDefinitionStatus,
  processDefinitions,
  workflows,
} from "@/lib/db/schema";
import { validateFormFields } from "@/lib/process-form-validation";
import { requireAdmin, requireUser } from "@/lib/session";

const MAX_CATEGORY_LENGTH = 60;

const ALLOWED_TRANSITIONS: Record<ProcessDefinitionStatus, ProcessDefinitionStatus[]> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
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
  if (!process || (guard.user.role !== "admin" && process.status !== "published")) {
    return NextResponse.json({ error: "Process not found" }, { status: 404 });
  }

  return NextResponse.json(process);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ processId: string }> }
) {
  const guard = await requireAdmin(request);
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
      const [workflow] = await db
        .select({ nodes: workflows.nodes })
        .from(workflows)
        .where(eq(workflows.id, current.workflowId))
        .limit(1);
      const hasTrigger = (workflow?.nodes ?? []).some(
        (node) => node?.data?.type === "trigger"
      );
      if (!hasTrigger) {
        return NextResponse.json(
          { error: "Add a trigger step to the workflow before publishing" },
          { status: 409 }
        );
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

  return NextResponse.json(await loadSummary(processId));
}
