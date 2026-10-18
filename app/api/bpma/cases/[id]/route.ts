import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { db } from "@/lib/db";
import {
  type CasePatch,
  canAccessCase,
  canViewCase,
  getCase,
  getCaseDetail,
  updateCase,
} from "@/lib/db/bpma";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  MAX_CASE_TITLE_LENGTH,
} from "@/lib/db/case-options";
import type { CasePriority, CaseStatus } from "@/lib/db/schema";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

const notFound = () =>
  NextResponse.json({ error: "Case not found" }, { status: 404 });

// GET /api/bpma/cases/:id - the case with its timeline and tasks
export async function GET(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const record = await getCase(id);
  // Answer 404 rather than 403 so case ids cannot be probed
  if (!(record && (await canAccessCase(guard.user, record)))) {
    return notFound();
  }

  return NextResponse.json(await getCaseDetail(record));
}

// Each applier validates one field and returns an error message, or nothing
type PatchApplier = (
  body: Record<string, unknown>,
  patch: CasePatch
) => string | undefined;

const applyTitle: PatchApplier = (body, patch) => {
  if (body.title === undefined) {
    return;
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_CASE_TITLE_LENGTH) {
    return `Title must be 1 to ${MAX_CASE_TITLE_LENGTH} characters`;
  }
  patch.title = title;
};

const applyStatus: PatchApplier = (body, patch) => {
  if (body.status === undefined) {
    return;
  }
  if (!CASE_STATUSES.includes(body.status as CaseStatus)) {
    return "Unknown status";
  }
  patch.status = body.status as CaseStatus;
};

const applyPriority: PatchApplier = (body, patch) => {
  if (body.priority === undefined) {
    return;
  }
  if (!CASE_PRIORITIES.includes(body.priority as CasePriority)) {
    return "Unknown priority";
  }
  patch.priority = body.priority as CasePriority;
};

const applyMetadata: PatchApplier = (body, patch) => {
  if (body.metadata === undefined) {
    return;
  }
  if (
    !body.metadata ||
    typeof body.metadata !== "object" ||
    Array.isArray(body.metadata)
  ) {
    return "Metadata must be an object";
  }
  patch.metadata = body.metadata as Record<string, unknown>;
};

const applyDueAt: PatchApplier = (body, patch) => {
  if (body.dueAt === undefined) {
    return;
  }
  if (body.dueAt === null) {
    patch.dueAt = null;
    return;
  }
  const due = new Date(String(body.dueAt));
  if (Number.isNaN(due.getTime())) {
    return "Invalid due date";
  }
  patch.dueAt = due;
};

const applyParticipants: PatchApplier = (body, patch) => {
  if (body.participants === undefined) {
    return;
  }
  if (
    !Array.isArray(body.participants) ||
    body.participants.some((item) => typeof item !== "string")
  ) {
    return "Participants must be a list of user ids";
  }
  patch.participants = [...new Set(body.participants as string[])];
};

const PATCH_APPLIERS: PatchApplier[] = [
  applyTitle,
  applyStatus,
  applyPriority,
  applyMetadata,
  applyDueAt,
  applyParticipants,
];

function parsePatch(
  body: Record<string, unknown>
): { ok: true; patch: CasePatch } | { ok: false; error: string } {
  const patch: CasePatch = {};
  for (const apply of PATCH_APPLIERS) {
    const error = apply(body, patch);
    if (error) {
      return { error, ok: false };
    }
  }
  return { ok: true, patch };
}

// PATCH /api/bpma/cases/:id - the initiator or an admin can edit a case
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const record = await getCase(id);
  if (!(record && canViewCase(guard.user, record))) {
    return notFound();
  }
  if (guard.user.role !== "admin" && record.initiatorId !== guard.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsed = parsePatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.patch.participants) {
    // The initiator always stays on the case
    if (!parsed.patch.participants.includes(record.initiatorId)) {
      parsed.patch.participants.push(record.initiatorId);
    }
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, parsed.patch.participants));
    if (found.length !== parsed.patch.participants.length) {
      return NextResponse.json(
        { error: "A participant does not exist" },
        { status: 400 }
      );
    }
  }

  const updated = await updateCase(id, parsed.patch, guard.user.id);
  return updated ? NextResponse.json(updated) : notFound();
}
