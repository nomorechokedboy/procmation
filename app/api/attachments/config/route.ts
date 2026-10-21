import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { attachmentSettings } from "@/lib/storage/s3";

// GET /api/attachments/config - whether uploads are set up, and the size limit
export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }
  return NextResponse.json(attachmentSettings());
}
