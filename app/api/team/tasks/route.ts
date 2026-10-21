import { and, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, type TaskStatus, tasks, users } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";
import { reportIdsOf } from "@/lib/team-sql";

const TASK_STATUSES: TaskStatus[] = ["pending", "completed", "cancelled"];

// GET /api/team/tasks?status= - tasks held by the people who report to you,
// read-only
export async function GET(request: Request) {
  const guard = await requirePermission(request, "team.view");
  if (!guard.ok) {
    return guard.response;
  }

  const status = new URL(request.url).searchParams.get("status");
  if (status && !TASK_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }

  const reports = await reportIdsOf(guard.user.id);
  if (reports.length === 0) {
    return NextResponse.json([]);
  }

  const rows = await db
    .select({
      ...getTableColumns(tasks),
      assigneeEmail: users.email,
      assigneeName: users.name,
      caseId: cases.id,
      caseNumber: cases.caseNumber,
      caseTitle: cases.title,
    })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.assigneeId))
    .leftJoin(cases, eq(cases.processInstanceId, tasks.instanceId))
    .where(
      and(
        inArray(tasks.assigneeId, reports),
        status ? eq(tasks.status, status as TaskStatus) : undefined
      )
    )
    .orderBy(desc(tasks.createdAt));

  return NextResponse.json(
    rows.map(({ assigneeEmail, assigneeName, ...task }) => ({
      ...task,
      assigneeName: assigneeName || assigneeEmail || "",
    }))
  );
}
