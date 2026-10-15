import { NextResponse } from "next/server";
import { canActOnTask, getDepartmentIdOf, getTask } from "@/lib/db/bpma";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

// GET /api/bpma/tasks/:id
export async function GET(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const task = await getTask(id);
  if (
    !(
      task &&
      canActOnTask(guard.user, task, await getDepartmentIdOf(guard.user.id))
    )
  ) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}
