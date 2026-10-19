import "server-only";

import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { AUDIT_RESOURCES, recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  cases,
  caseTimeline,
  tasks,
  userProfiles,
  users,
} from "@/lib/db/schema";
import { escalationGraceMs } from "@/lib/due";
import { notifyUser } from "@/lib/notifications/deliver";

export type DeadlineReport = { reminded: number; escalated: number };

type OverdueTask = {
  id: string;
  name: string;
  assigneeId: string;
  caseId: string | null;
  caseNumber: string;
  caseTitle: string;
};

const overdueColumns = {
  assigneeId: tasks.assigneeId,
  caseId: cases.id,
  caseNumber: cases.caseNumber,
  caseTitle: cases.title,
  id: tasks.id,
  name: tasks.name,
};

function toOverdue(
  rows: Array<{
    assigneeId: string | null;
    caseId: string | null;
    caseNumber: string | null;
    caseTitle: string | null;
    id: string;
    name: string;
  }>
): OverdueTask[] {
  return rows.flatMap((row) =>
    row.assigneeId
      ? [
          {
            assigneeId: row.assigneeId,
            caseId: row.caseId,
            caseNumber: row.caseNumber ?? "",
            caseTitle: row.caseTitle ?? "",
            id: row.id,
            name: row.name,
          },
        ]
      : []
  );
}

// A deadline event on a task, with its case as the parent
function taskDeadlineEntry(
  task: OverdueTask,
  action: string,
  summary: string,
  metadata?: Record<string, unknown>
) {
  return {
    action,
    actor: "system" as const,
    metadata,
    parent: task.caseId
      ? { id: task.caseId, label: task.caseNumber, type: "case" }
      : undefined,
    resourceId: task.id,
    resourceLabel: task.name,
    resourceType: AUDIT_RESOURCES.task,
    summary,
  };
}

// Claims the reminder so two overlapping runs can never both send it
async function claimReminder(taskId: string, now: Date): Promise<boolean> {
  const claimed = await db
    .update(tasks)
    .set({ remindedAt: now })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.status, "pending"),
        isNull(tasks.remindedAt)
      )
    )
    .returning({ id: tasks.id });
  return claimed.length > 0;
}

async function remindAssignees(now: Date): Promise<number> {
  const due = toOverdue(
    await db
      .select(overdueColumns)
      .from(tasks)
      .leftJoin(cases, eq(cases.processInstanceId, tasks.instanceId))
      .where(
        and(
          eq(tasks.status, "pending"),
          isNotNull(tasks.assigneeId),
          isNull(tasks.remindedAt),
          lte(tasks.dueAt, now)
        )
      )
  );

  let sent = 0;
  for (const task of due) {
    // biome-ignore lint/performance/noAwaitInLoops: one task at a time keeps claims simple
    if (!(await claimReminder(task.id, now))) {
      continue;
    }
    await recordAudit(
      taskDeadlineEntry(
        task,
        "reminded",
        `"${task.name}" is overdue, so its assignee was reminded`
      )
    );
    await notifyUser({
      caseId: task.caseId,
      caseNumber: task.caseNumber,
      caseTitle: task.caseTitle,
      taskId: task.id,
      taskName: task.name,
      type: "task_overdue",
      userId: task.assigneeId,
    });
    sent += 1;
  }
  return sent;
}

async function managerOf(userId: string) {
  const [row] = await db
    .select({ managerId: userProfiles.managerId })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId));
  return row?.managerId ?? null;
}

// Claims the escalation, recording who was told (null when nobody could be)
async function claimEscalation(
  taskId: string,
  managerId: string | null,
  now: Date
): Promise<boolean> {
  const claimed = await db
    .update(tasks)
    .set({ escalatedAt: now, escalatedToId: managerId })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.status, "pending"),
        isNull(tasks.escalatedAt)
      )
    )
    .returning({ id: tasks.id });
  return claimed.length > 0;
}

async function escalateOne(task: OverdueTask, now: Date): Promise<boolean> {
  const managerId = await managerOf(task.assigneeId);
  if (!(await claimEscalation(task.id, managerId, now))) {
    return false;
  }
  if (task.caseId) {
    await db.insert(caseTimeline).values({
      caseId: task.caseId,
      data: { escalatedToId: managerId, name: task.name },
      eventType: "task_escalated",
      nodeId: null,
    });
  }
  await recordAudit(
    taskDeadlineEntry(
      task,
      "escalated",
      managerId
        ? `"${task.name}" is still open past its deadline, so the assignee's manager was told`
        : `"${task.name}" is still open past its deadline and the assignee has no manager to tell`,
      { escalatedToId: managerId }
    )
  );
  if (managerId) {
    const [assignee] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, task.assigneeId));
    await notifyUser({
      assigneeName: assignee?.name || assignee?.email || "",
      caseId: task.caseId,
      caseNumber: task.caseNumber,
      caseTitle: task.caseTitle,
      taskId: task.id,
      taskName: task.name,
      type: "escalation",
      userId: managerId,
    });
  }
  return true;
}

async function escalateToManagers(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - escalationGraceMs());
  const late = toOverdue(
    await db
      .select(overdueColumns)
      .from(tasks)
      .leftJoin(cases, eq(cases.processInstanceId, tasks.instanceId))
      .where(
        and(
          eq(tasks.status, "pending"),
          isNotNull(tasks.assigneeId),
          isNull(tasks.escalatedAt),
          lte(tasks.dueAt, cutoff)
        )
      )
  );

  let escalated = 0;
  for (const task of late) {
    // biome-ignore lint/performance/noAwaitInLoops: one task at a time keeps claims simple
    if (await escalateOne(task, now)) {
      escalated += 1;
    }
  }
  return escalated;
}

// Each deadline fires once: a reminder when a task is due, and a message to
// the assignee's manager once the grace period has passed. Safe to run as
// often as you like; claimed tasks are skipped.
export async function runDeadlineChecks(
  now = new Date()
): Promise<DeadlineReport> {
  const reminded = await remindAssignees(now);
  const escalated = await escalateToManagers(now);
  return { escalated, reminded };
}
