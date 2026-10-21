import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { toAttachmentView } from "@/lib/attachments";
import { db } from "@/lib/db";
import { getCase } from "@/lib/db/bpma";
import { attachments, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { caseAccess } from "@/lib/team";

type Params = { params: Promise<{ id: string }> };

// GET /api/bpma/cases/:id/attachments - the files on a case, oldest first
export async function GET(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const record = await getCase(id);
  if (!(record && (await caseAccess(guard.user, record)))) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const rows = await db
    .select({ attachment: attachments, email: users.email, name: users.name })
    .from(attachments)
    .innerJoin(users, eq(users.id, attachments.uploadedById))
    .where(and(eq(attachments.caseId, id), eq(attachments.status, "ready")))
    .orderBy(asc(attachments.createdAt));

  return NextResponse.json(
    rows.map((row) =>
      toAttachmentView(row.attachment, row.name || row.email || "")
    )
  );
}
