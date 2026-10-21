import "server-only";

import { inArray } from "drizzle-orm";
import { AUDIT_RESOURCES, type AuditEntry } from "@/lib/audit";
import { listCaseViewers } from "@/lib/case-viewers";
import { db } from "@/lib/db";
import { type Case, type CaseComment, users } from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications/deliver";

export const MAX_COMMENT_LENGTH = 4000;

export type CommentView = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
};

// The comment text, trimmed, or null when it is empty or too long
export function cleanBody(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const body = value.trim();
  return body && body.length <= MAX_COMMENT_LENGTH ? body : null;
}

// Only people who can see the case may be mentioned, and not the author.
// Anyone else in the request is dropped.
export async function validMentions(
  record: Case,
  requested: unknown,
  authorId: string
): Promise<string[]> {
  if (!Array.isArray(requested)) {
    return [];
  }
  const viewers = new Set((await listCaseViewers(record)).map((p) => p.id));
  const ids = requested.filter(
    (id): id is string =>
      typeof id === "string" && viewers.has(id) && id !== authorId
  );
  return [...new Set(ids)];
}

export async function toCommentViews(
  rows: CaseComment[]
): Promise<CommentView[]> {
  const ids = [
    ...new Set(rows.flatMap((row) => [row.authorId, ...row.mentions])),
  ];
  const people =
    ids.length > 0
      ? await db
          .select({ email: users.email, id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, ids))
      : [];
  const nameOf = (id: string) => {
    const person = people.find((item) => item.id === id);
    return person?.name || person?.email || "";
  };
  return rows.map((row) => ({
    authorId: row.authorId,
    authorName: nameOf(row.authorId),
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    mentions: row.mentions.map((id) => ({ id, name: nameOf(id) })),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

// Tells each newly mentioned person, without making the caller wait
export function notifyMentioned(input: {
  record: Case;
  ids: string[];
  actorName: string;
}) {
  for (const userId of input.ids) {
    notifyUser({
      actorName: input.actorName,
      caseId: input.record.id,
      caseNumber: input.record.caseNumber,
      caseTitle: input.record.title,
      type: "mentioned",
      userId,
    }).catch((error) =>
      console.error(
        "[comments] could not notify:",
        error instanceof Error ? error.message : "unknown error"
      )
    );
  }
}

export function commentAudit(input: {
  action: "created" | "edited" | "deleted";
  actor: { id: string; name: string };
  record: Case;
  commentId: string;
  mentions: string[];
  // Whose comment it was, when someone else removed it
  authorName?: string;
}): AuditEntry {
  const verb = {
    created: "commented on",
    deleted: "deleted a comment on",
    edited: "edited a comment on",
  }[input.action];
  const owner =
    input.authorName && input.action === "deleted"
      ? ` (by ${input.authorName})`
      : "";
  return {
    action: input.action,
    actor: input.actor,
    metadata: { mentions: input.mentions },
    parent: {
      id: input.record.id,
      label: input.record.caseNumber,
      type: "case",
    },
    resourceId: input.commentId,
    resourceLabel: input.record.caseNumber,
    resourceType: AUDIT_RESOURCES.comment,
    summary: `${input.actor.name} ${verb} ${input.record.caseNumber}${owner}`,
  };
}
