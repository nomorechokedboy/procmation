import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { recordAudit, userActor } from "@/lib/audit";
import {
  cleanBody,
  commentAudit,
  notifyMentioned,
  toCommentViews,
  validMentions,
} from "@/lib/comments";
import { db } from "@/lib/db";
import { canAccessCase, getCase } from "@/lib/db/bpma";
import { caseComments } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

// GET /api/bpma/cases/:id/comments - oldest first
export async function GET(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const record = await getCase(id);
  if (!(record && (await canAccessCase(guard.user, record)))) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(caseComments)
    .where(eq(caseComments.caseId, id))
    .orderBy(asc(caseComments.createdAt));
  return NextResponse.json(await toCommentViews(rows));
}

// POST /api/bpma/cases/:id/comments
// Body: { body: string, mentions?: string[] }
export async function POST(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const record = await getCase(id);
  if (!(record && (await canAccessCase(guard.user, record)))) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const input = await readJsonObject(request);
  const body = cleanBody(input?.body);
  if (!body) {
    return NextResponse.json(
      { error: "Write a comment of up to 4000 characters" },
      { status: 400 }
    );
  }

  const mentions = await validMentions(record, input?.mentions, guard.user.id);
  const [created] = await db
    .insert(caseComments)
    .values({ authorId: guard.user.id, body, caseId: id, mentions })
    .returning();

  const actor = userActor(guard.user);
  recordAudit(
    commentAudit({
      action: "created",
      actor,
      commentId: created.id,
      mentions,
      record,
    })
  );
  notifyMentioned({ actorName: actor.name, ids: mentions, record });

  const [view] = await toCommentViews([created]);
  return NextResponse.json(view, { status: 201 });
}
