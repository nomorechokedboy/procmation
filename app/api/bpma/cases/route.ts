import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { db } from "@/lib/db";
import { listCases } from "@/lib/db/bpma";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  MAX_CASE_TITLE_LENGTH,
} from "@/lib/db/case-options";
import type { CasePriority, CaseStatus } from "@/lib/db/schema";
import { processDefinitions } from "@/lib/db/schema";
import { checkFormFiles, linkFormFiles } from "@/lib/form-files";
import { validateFormValues } from "@/lib/process-form-validation";
import { startProcessCase } from "@/lib/process-runner";
import { requireUser } from "@/lib/session";

// GET /api/bpma/cases - cases the user started or takes part in.
// Admins can pass all=true to see every case.
export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const priority = params.get("priority");

  if (status && !CASE_STATUSES.includes(status as CaseStatus)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }
  if (priority && !CASE_PRIORITIES.includes(priority as CasePriority)) {
    return NextResponse.json({ error: "Unknown priority" }, { status: 400 });
  }

  const viewAll = params.get("all") === "true";
  if (viewAll && !guard.user.permissions.includes("cases.view_all")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await listCases({
    priority: (priority as CasePriority | null) ?? undefined,
    processDefinitionId: params.get("processId") ?? undefined,
    status: (status as CaseStatus | null) ?? undefined,
    visibleTo: viewAll ? undefined : guard.user.id,
  });

  return NextResponse.json(rows);
}

// No date is fine; a value that is not a date is not
function parseDueAt(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

// POST /api/bpma/cases - open a case for a published process and start it.
// Body: { processDefinitionId, title, priority?, dueAt?, metadata?, values? }
// where values answers the process start form.
export async function POST(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_CASE_TITLE_LENGTH) {
    return NextResponse.json(
      { error: `Title is required, up to ${MAX_CASE_TITLE_LENGTH} characters` },
      { status: 400 }
    );
  }

  const priority = (body.priority ?? "medium") as CasePriority;
  if (!CASE_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: "Unknown priority" }, { status: 400 });
  }

  const dueAt = parseDueAt(body.dueAt);
  if (dueAt === "invalid") {
    return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
  }

  const metadata = body.metadata ?? {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return NextResponse.json(
      { error: "Metadata must be an object" },
      { status: 400 }
    );
  }

  if (typeof body.processDefinitionId !== "string") {
    return NextResponse.json(
      { error: "processDefinitionId is required" },
      { status: 400 }
    );
  }

  const [definition] = await db
    .select({
      startFormFields: processDefinitions.startFormFields,
      status: processDefinitions.status,
      workflowId: processDefinitions.workflowId,
    })
    .from(processDefinitions)
    .where(eq(processDefinitions.id, body.processDefinitionId));
  if (!definition) {
    return NextResponse.json({ error: "Process not found" }, { status: 404 });
  }
  if (definition.status !== "published") {
    return NextResponse.json(
      { error: "Process is not published" },
      { status: 400 }
    );
  }

  const startValues = validateFormValues(
    definition.startFormFields,
    body.values ?? {}
  );
  if (!startValues.ok) {
    return NextResponse.json({ error: startValues.error }, { status: 400 });
  }

  const files = await checkFormFiles(
    definition.startFormFields,
    startValues.values,
    guard.user.id
  );
  if (!files.ok) {
    return NextResponse.json({ error: files.error }, { status: 400 });
  }

  try {
    const created = await startProcessCase({
      dueAt,
      initiatorId: guard.user.id,
      metadata: metadata as Record<string, unknown>,
      priority,
      processDefinitionId: body.processDefinitionId,
      requester: {
        email: guard.user.email,
        id: guard.user.id,
        name: guard.user.name,
      },
      startValues: startValues.values,
      title,
      workflowId: definition.workflowId,
    });
    await linkFormFiles({
      caseId: created.id,
      ids: files.ids,
      user: guard.user,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[cases] failed to start process:", error);
    return NextResponse.json(
      { error: "The process could not be started" },
      { status: 500 }
    );
  }
}
