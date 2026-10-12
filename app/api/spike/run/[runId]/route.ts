import { NextResponse } from "next/server";
import { getRun } from "workflow/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const run = getRun(runId);
  const status = await run.status;
  const returnValue = status === "completed" ? await run.returnValue : null;
  return NextResponse.json({ runId, status, returnValue });
}
