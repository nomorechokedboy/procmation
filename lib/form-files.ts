import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { attachmentAudit } from "@/lib/attachments";
import { recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCase } from "@/lib/db/bpma";
import { attachments } from "@/lib/db/schema";
import type { FormField } from "@/lib/types/process-form";

type FileCheck = { ok: true; ids: string[] } | { ok: false; error: string };

// The files a submission points at must be ready, uploaded by the person
// submitting, and not already used elsewhere
export async function checkFormFiles(
  fields: FormField[],
  values: Record<string, unknown>,
  userId: string
): Promise<FileCheck> {
  const ids = fields
    .filter((field) => field.type === "file")
    .map((field) => values[field.key])
    .filter((value): value is string => typeof value === "string");
  if (ids.length === 0) {
    return { ids, ok: true };
  }
  if (new Set(ids).size !== ids.length) {
    return { error: "Each file can be used once", ok: false };
  }

  const found = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(
        inArray(attachments.id, ids),
        eq(attachments.uploadedById, userId),
        eq(attachments.status, "ready"),
        isNull(attachments.caseId)
      )
    );
  if (found.length !== ids.length) {
    return {
      error: "A file in the form is missing: upload it again",
      ok: false,
    };
  }
  return { ids, ok: true };
}

// Attaches the checked files to the case (and task) the form belongs to
export async function linkFormFiles(input: {
  ids: string[];
  caseId: string;
  taskId?: string;
  user: { id: string; name: string; email: string };
}): Promise<void> {
  if (input.ids.length === 0) {
    return;
  }
  const linked = await db
    .update(attachments)
    .set({ caseId: input.caseId, taskId: input.taskId ?? null })
    .where(and(inArray(attachments.id, input.ids), isNull(attachments.caseId)))
    .returning();
  const record = await getCase(input.caseId);
  recordAudit(
    linked.map((attachment) =>
      attachmentAudit({
        action: "uploaded",
        actor: userActor(input.user),
        attachment,
        record,
      })
    )
  );
}
