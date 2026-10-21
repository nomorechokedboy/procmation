import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { attachmentAudit } from "@/lib/attachments";
import { recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { canAccessCase, getCase } from "@/lib/db/bpma";
import { type Attachment, attachments, users } from "@/lib/db/schema";
import { ADMIN_ROLE } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { deleteStored, presignDownload } from "@/lib/storage/s3";
import { caseAccess } from "@/lib/team";

type Params = { params: Promise<{ id: string }> };

// Who may open the file: you, if it is still your draft; otherwise anyone who
// can open its case
async function canOpen(
  user: Parameters<typeof canAccessCase>[0],
  row: Attachment,
  // Managers of people on the case may download but not change anything
  readOnly = false
): Promise<boolean> {
  if (row.uploadedById === user.id) {
    return true;
  }
  if (!row.caseId) {
    return false;
  }
  const record = await getCase(row.caseId);
  if (!record) {
    return false;
  }
  return readOnly
    ? Boolean(await caseAccess(user, record))
    : await canAccessCase(user, record);
}

// GET /api/bpma/attachments/:id - sends the browser to a short-lived download
export async function GET(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const [row] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id));
  if (
    !(row && row.status === "ready" && (await canOpen(guard.user, row, true)))
  ) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.redirect(
    await presignDownload(row.storageKey, row.filename),
    302
  );
}

// DELETE /api/bpma/attachments/:id - the uploader, or an admin
export async function DELETE(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const [row] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id));
  if (!(row && (await canOpen(guard.user, row)))) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const isUploader = row.uploadedById === guard.user.id;
  if (!(isUploader || guard.user.role === ADMIN_ROLE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteStored(row.storageKey);
  await db.delete(attachments).where(eq(attachments.id, row.id));

  if (row.caseId && row.status === "ready") {
    const [uploader] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, row.uploadedById));
    recordAudit(
      attachmentAudit({
        action: "deleted",
        actor: userActor(guard.user),
        attachment: row,
        ownerName: isUploader
          ? undefined
          : uploader?.name || uploader?.email || "",
        record: await getCase(row.caseId),
      })
    );
  }
  return NextResponse.json({ success: true });
}
