import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { cleanContentType, cleanFilename } from "@/lib/attachments";
import { db } from "@/lib/db";
import { canAccessCase, getCase } from "@/lib/db/bpma";
import { attachments } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { attachmentSettings, presignUpload } from "@/lib/storage/s3";
import { generateId } from "@/lib/utils/id";

// POST /api/bpma/attachments
// Body: { filename, size, contentType?, caseId? }. Reserves the file and
// returns a URL to PUT it to; call .../complete once it is uploaded. Without a
// caseId the file is private to you until a form submission claims it.
export async function POST(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const settings = attachmentSettings();
  if (!settings.enabled) {
    return NextResponse.json(
      { error: "File attachments are not set up on this server" },
      { status: 503 }
    );
  }

  const body = await readJsonObject(request);
  const filename = cleanFilename(body?.filename);
  const size = body?.size;
  if (!(filename && Number.isInteger(size) && (size as number) > 0)) {
    return NextResponse.json(
      { error: "Send a filename and the size in bytes" },
      { status: 400 }
    );
  }
  if ((size as number) > settings.maxBytes) {
    return NextResponse.json(
      {
        error: `Files can be up to ${Math.floor(settings.maxBytes / 1024 / 1024)} MB`,
      },
      { status: 413 }
    );
  }

  let caseId: string | null = null;
  if (typeof body?.caseId === "string") {
    const record = await getCase(body.caseId);
    if (!(record && (await canAccessCase(guard.user, record)))) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    caseId = record.id;
  }

  const id = generateId();
  const contentType = cleanContentType(body?.contentType);
  await db.insert(attachments).values({
    caseId,
    contentType,
    filename,
    id,
    size: size as number,
    storageKey: `attachments/${id}`,
    uploadedById: guard.user.id,
  });

  return NextResponse.json(
    {
      contentType,
      id,
      uploadUrl: await presignUpload(`attachments/${id}`, contentType),
    },
    { status: 201 }
  );
}
