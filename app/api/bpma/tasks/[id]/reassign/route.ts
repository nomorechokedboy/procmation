import { and, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { getTask, reassignTask } from "@/lib/db/bpma";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

// POST /api/bpma/tasks/:id/reassign
// Body: { assigneeId: string }. The current assignee or an admin can hand a
// task to another member.
export async function POST(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (guard.user.role !== "admin" && task.assigneeId !== guard.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(request);
  if (!body || typeof body.assigneeId !== "string") {
    return NextResponse.json(
      { error: "assigneeId is required" },
      { status: 400 }
    );
  }

  const [assignee] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, body.assigneeId),
        or(isNull(users.isAnonymous), eq(users.isAnonymous, false))
      )
    );
  if (!assignee) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const result = await reassignTask({
    task,
    newAssigneeId: assignee.id,
    actorId: guard.user.id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Only a pending task can be reassigned" },
      { status: 409 }
    );
  }

  return NextResponse.json(result.task);
}
