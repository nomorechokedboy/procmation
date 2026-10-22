import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processVersions, users } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";

// GET /api/processes/:id/versions - published versions, newest first
export async function GET(
  request: Request,
  { params }: { params: Promise<{ processId: string }> }
) {
  const guard = await requirePermission(request, "processes.manage");
  if (!guard.ok) {
    return guard.response;
  }
  const { processId } = await params;
  const rows = await db
    .select({
      id: processVersions.id,
      note: processVersions.note,
      publishedAt: processVersions.createdAt,
      publishedByName: users.name,
      stepCount: processVersions.nodes,
      version: processVersions.version,
    })
    .from(processVersions)
    .leftJoin(users, eq(users.id, processVersions.publishedById))
    .where(eq(processVersions.definitionId, processId))
    .orderBy(desc(processVersions.version));

  return NextResponse.json(
    rows.map(({ stepCount, ...row }) => ({
      ...row,
      stepCount: stepCount.length,
    }))
  );
}
