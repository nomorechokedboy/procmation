import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { createCase, listCases } from "@/lib/db/bpma";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  MAX_CASE_TITLE_LENGTH,
} from "@/lib/db/case-options";
import { db } from "@/lib/db";
import type { CasePriority, CaseStatus } from "@/lib/db/schema";
import { processDefinitions } from "@/lib/db/schema";
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
  if (viewAll && guard.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await listCases({
    visibleTo: viewAll ? undefined : guard.user.id,
    status: (status as CaseStatus | null) ?? undefined,
    priority: (priority as CasePriority | null) ?? undefined,
    processDefinitionId: params.get("processId") ?? undefined,
  });

  return NextResponse.json(rows);
}

// POST /api/bpma/cases - open a case for a published process
export async function POST(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
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

  let dueAt: Date | null = null;
  if (body.dueAt !== undefined && body.dueAt !== null) {
    dueAt = new Date(String(body.dueAt));
    if (Number.isNaN(dueAt.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }
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
    .select({ status: processDefinitions.status })
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

  const created = await createCase({
    processDefinitionId: body.processDefinitionId,
    title,
    priority,
    initiatorId: guard.user.id,
    metadata: metadata as Record<string, unknown>,
    dueAt,
  });

  return NextResponse.json(created, { status: 201 });
}
