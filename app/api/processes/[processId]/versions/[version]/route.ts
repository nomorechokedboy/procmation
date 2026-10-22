import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processVersions } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";

// GET /api/processes/:id/versions/:version - one frozen version, in full
export async function GET(
  request: Request,
  { params }: { params: Promise<{ processId: string; version: string }> }
) {
  const guard = await requirePermission(request, "processes.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { processId, version } = await params;
  const number = Number(version);
  if (!Number.isInteger(number)) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }
  const [row] = await db
    .select()
    .from(processVersions)
    .where(
      and(
        eq(processVersions.definitionId, processId),
        eq(processVersions.version, number)
      )
    );
  if (!row) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}
