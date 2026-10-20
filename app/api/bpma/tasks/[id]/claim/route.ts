import { NextResponse } from "next/server";
import { userActor } from "@/lib/audit";
import { getDepartmentIdOf, getTask } from "@/lib/db/bpma";
import { claimTask } from "@/lib/db/task-claims";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

// POST /api/bpma/tasks/:id/claim
// A member of the department a task was sent to takes it for themselves.
export async function POST(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const departmentId = await getDepartmentIdOf(guard.user.id);
  const task = await getTask(id);
  if (!(task && departmentId && task.assigneeDepartmentId === departmentId)) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const result = await claimTask({
    actor: userActor(guard.user),
    departmentId,
    taskId: id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Someone already took this task, or it is finished" },
      { status: 409 }
    );
  }

  return NextResponse.json({ ...task, ...result.task });
}
