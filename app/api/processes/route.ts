import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/db/errors";
import { processSummarySelection } from "@/lib/db/process-queries";
import { processDefinitions, workflows } from "@/lib/db/schema";
import { validateFormFields } from "@/lib/process-form-validation";
import { requireAdmin, requireUser } from "@/lib/session";

const MAX_CATEGORY_LENGTH = 60;

export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const query = db
    .select(processSummarySelection)
    .from(processDefinitions)
    .innerJoin(workflows, eq(processDefinitions.workflowId, workflows.id));

  // Members only see processes they can start
  const rows = await (guard.user.role === "admin"
    ? query
    : query.where(eq(processDefinitions.status, "published"))
  ).orderBy(asc(workflows.name));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = (await request.json()) as {
    workflowId?: string;
    category?: string | null;
    startFormFields?: unknown;
  };

  if (!body.workflowId) {
    return NextResponse.json({ error: "Choose a workflow" }, { status: 400 });
  }

  const category = body.category?.trim() || null;
  if (category && category.length > MAX_CATEGORY_LENGTH) {
    return NextResponse.json(
      { error: `Category must be at most ${MAX_CATEGORY_LENGTH} characters` },
      { status: 400 }
    );
  }

  const fields = validateFormFields(body.startFormFields ?? []);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const [workflow] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(eq(workflows.id, body.workflowId))
    .limit(1);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  try {
    const [created] = await db
      .insert(processDefinitions)
      .values({
        workflowId: workflow.id,
        category,
        startFormFields: fields.fields,
        createdBy: guard.user.id,
      })
      .returning({ id: processDefinitions.id });

    const [summary] = await db
      .select(processSummarySelection)
      .from(processDefinitions)
      .innerJoin(workflows, eq(processDefinitions.workflowId, workflows.id))
      .where(eq(processDefinitions.id, created.id));

    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      return NextResponse.json(
        { error: "This workflow is already a process" },
        { status: 409 }
      );
    }
    throw error;
  }
}
