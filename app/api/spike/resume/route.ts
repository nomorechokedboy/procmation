import { NextResponse } from "next/server";
import { resumeHook } from "workflow/api";
import { type Decision, taskToken } from "@/lib/spike/leave.workflow";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    instanceId: string;
    taskName: string;
  } & Decision;
  try {
    const hook = await resumeHook(taskToken(body.instanceId, body.taskName), {
      outcome: body.outcome,
      by: body.by,
      comment: body.comment,
    });
    return NextResponse.json({ resumed: true, runId: hook.runId });
  } catch (error) {
    return NextResponse.json(
      { resumed: false, error: String(error) },
      { status: 404 }
    );
  }
}
