import { NextResponse } from "next/server";
import { userActor } from "@/lib/audit";
import { getTask } from "@/lib/db/bpma";
import { releaseTask } from "@/lib/db/task-claims";
import { ADMIN_ROLE } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

// POST /api/bpma/tasks/:id/release
// Whoever took a pool task puts it back for the department; admins can too.
export async function POST(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const task = await getTask(id);
  const isAdmin = guard.user.role === ADMIN_ROLE;
  if (!(task && (isAdmin || task.assigneeId === guard.user.id))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const result = await releaseTask({
    actor: userActor(guard.user),
    holderId: isAdmin ? null : guard.user.id,
    taskId: id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Only a pending task taken from a team pool can go back" },
      { status: 409 }
    );
  }

  return NextResponse.json({ ...task, ...result.task });
}
