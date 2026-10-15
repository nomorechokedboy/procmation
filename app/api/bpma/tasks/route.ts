import { NextResponse } from "next/server";
import { listTasksForUser } from "@/lib/db/bpma";
import type { TaskStatus } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

const TASK_STATUSES: TaskStatus[] = ["pending", "completed", "cancelled"];

// GET /api/bpma/tasks - tasks assigned to the user, plus unclaimed tasks
// of the user's department
export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const status = new URL(request.url).searchParams.get("status");
  if (status && !TASK_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }

  const rows = await listTasksForUser(
    guard.user.id,
    (status as TaskStatus | null) ?? undefined
  );
  return NextResponse.json(rows);
}
