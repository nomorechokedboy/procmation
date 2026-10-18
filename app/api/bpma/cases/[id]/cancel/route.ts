import { NextResponse } from "next/server";
import { getRun } from "workflow/api";
import { canAccessCase, cancelCase, getCase } from "@/lib/db/bpma";
import { notifyUser } from "@/lib/notifications/deliver";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

// POST /api/bpma/cases/:id/cancel - the person who started a case, or an
// admin, can cancel it while it is still running
export async function POST(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const record = await getCase(id);
  if (!(record && (await canAccessCase(guard.user, record)))) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (guard.user.role !== "admin" && record.initiatorId !== guard.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await cancelCase({ actorId: guard.user.id, caseId: id });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Only a running case can be cancelled" },
      { status: 409 }
    );
  }

  // The records already say "cancelled", so a task completed in the meantime
  // is refused. Stop the waiting run too; if that fails the case stays
  // cancelled and the run is harmless, because it can no longer be resumed.
  if (result.runId) {
    try {
      await getRun(result.runId).cancel();
    } catch (error) {
      console.error("[cases] could not cancel the run:", error);
    }
  }

  if (record.initiatorId !== guard.user.id) {
    await notifyUser({
      caseId: record.id,
      caseNumber: record.caseNumber,
      caseTitle: record.title,
      type: "case_cancelled",
      userId: record.initiatorId,
    });
  }

  return NextResponse.json(result.record);
}
