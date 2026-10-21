import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { attachmentAudit, toAttachmentView } from "@/lib/attachments";
import { recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCase } from "@/lib/db/bpma";
import { attachments } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { deleteStored, storedSize } from "@/lib/storage/s3";

type Params = { params: Promise<{ id: string }> };

// POST /api/bpma/attachments/:id/complete - the uploader confirms the file is
// in the bucket. The server checks it is really there and the size matches.
export async function POST(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const [row] = await db
    .select()
    .from(attachments)
    .where(
      and(eq(attachments.id, id), eq(attachments.uploadedById, guard.user.id))
    );
  if (!row) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  if (row.status === "ready") {
    return NextResponse.json(toAttachmentView(row, guard.user.name));
  }

  const size = await storedSize(row.storageKey);
  if (size === null) {
    return NextResponse.json(
      { error: "The file has not been uploaded" },
      { status: 409 }
    );
  }
  if (size !== row.size) {
    await deleteStored(row.storageKey);
    await db.delete(attachments).where(eq(attachments.id, row.id));
    return NextResponse.json(
      { error: "The uploaded file does not match its declared size" },
      { status: 400 }
    );
  }

  const [ready] = await db
    .update(attachments)
    .set({ status: "ready" })
    .where(eq(attachments.id, row.id))
    .returning();

  if (ready.caseId) {
    recordAudit(
      attachmentAudit({
        action: "uploaded",
        actor: userActor(guard.user),
        attachment: ready,
        record: await getCase(ready.caseId),
      })
    );
  }
  return NextResponse.json(toAttachmentView(ready, guard.user.name));
}
