import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { type LeaveInput, leaveSpike } from "@/lib/spike/leave.workflow";

export async function POST(request: Request) {
  const body = (await request.json()) as LeaveInput;
  const run = await start(leaveSpike, [body]);
  return NextResponse.json({ runId: run.runId });
}
