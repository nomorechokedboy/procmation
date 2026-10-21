import { and, eq } from "drizzle-orm";
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
import { ADMIN_ROLE } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string; commentId: string }> };

async function load(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return { response: guard.response } as const;
  }
  const { commentId, id } = await params;
  const record = await getCase(id);
  if (!(record && (await canAccessCase(guard.user, record)))) {
    return {
      response: NextResponse.json({ error: "Case not found" }, { status: 404 }),
    } as const;
  }
  const [comment] = await db
    .select()
    .from(caseComments)
    .where(and(eq(caseComments.id, commentId), eq(caseComments.caseId, id)));
  if (!comment) {
    return {
      response: NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      ),
    } as const;
  }
  return { comment, record, user: guard.user } as const;
}

// PATCH - only the author edits. Body: { body: string, mentions?: string[] }
export async function PATCH(request: Request, context: Params) {
  const loaded = await load(request, context);
  if ("response" in loaded) {
    return loaded.response;
  }
  const { comment, record, user } = loaded;
  if (comment.authorId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const input = await readJsonObject(request);
  const body = cleanBody(input?.body);
  if (!body) {
    return NextResponse.json(
      { error: "Write a comment of up to 4000 characters" },
      { status: 400 }
    );
  }

  const mentions = await validMentions(record, input?.mentions, user.id);
  const [updated] = await db
    .update(caseComments)
    .set({ body, mentions, updatedAt: new Date() })
    .where(eq(caseComments.id, comment.id))
    .returning();

  const actor = userActor(user);
  recordAudit(
    commentAudit({
      action: "edited",
      actor,
      commentId: comment.id,
      mentions,
      record,
    })
  );
  // Only people who were not already tagged hear about it
  notifyMentioned({
    actorName: actor.name,
    ids: mentions.filter((id) => !comment.mentions.includes(id)),
    record,
  });

  const [view] = await toCommentViews([updated]);
  return NextResponse.json(view);
}

// DELETE - the author, or an admin
export async function DELETE(request: Request, context: Params) {
  const loaded = await load(request, context);
  if ("response" in loaded) {
    return loaded.response;
  }
  const { comment, record, user } = loaded;
  const isAuthor = comment.authorId === user.id;
  if (!(isAuthor || user.role === ADMIN_ROLE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(caseComments).where(eq(caseComments.id, comment.id));

  const [view] = await toCommentViews([comment]);
  recordAudit(
    commentAudit({
      action: "deleted",
      actor: userActor(user),
      authorName: isAuthor ? undefined : view.authorName,
      commentId: comment.id,
      mentions: comment.mentions,
      record,
    })
  );
  return NextResponse.json({ success: true });
}
