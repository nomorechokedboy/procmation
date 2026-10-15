import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { pushNotificationToUser } from "@/lib/notifications/sse-hub";
import type { FormField } from "@/lib/types/process-form";
import { db } from "./index";
import {
  type Case,
  type CasePriority,
  type CaseStatus,
  type CaseTimelineEntry,
  caseTimeline,
  cases,
  formSubmissions,
  type NewNotification,
  notifications,
  type Task,
  type TaskStatus,
  type TimelineEventType,
  tasks,
  userProfiles,
} from "./schema";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CaseViewer = { id: string; role: "admin" | "member" };

// ---------------------------------------------------------------------------
// Case timeline
// ---------------------------------------------------------------------------

export async function addTimelineEvent(
  tx: Tx,
  event: {
    caseId: string;
    eventType: TimelineEventType;
    actorId?: string | null;
    nodeId?: string | null;
    data?: Record<string, unknown>;
  }
) {
  await tx.insert(caseTimeline).values({
    caseId: event.caseId,
    eventType: event.eventType,
    actorId: event.actorId ?? null,
    nodeId: event.nodeId ?? null,
    data: event.data ?? {},
  });
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

// Numbers come from a database sequence so concurrent requests can never
// receive the same one. The sequence does not reset each year.
async function nextCaseNumber(tx: Tx): Promise<string> {
  const rows = await tx.execute<{ n: string }>(
    sql`select nextval('case_number_seq') as n`
  );
  const sequence = Number(rows[0]?.n ?? 0);
  return `CASE-${new Date().getFullYear()}-${String(sequence).padStart(5, "0")}`;
}

export function createCase(input: {
  processDefinitionId: string;
  title: string;
  priority: CasePriority;
  initiatorId: string;
  metadata: Record<string, unknown>;
  dueAt: Date | null;
}): Promise<Case> {
  return db.transaction(async (tx) => {
    const caseNumber = await nextCaseNumber(tx);
    const [created] = await tx
      .insert(cases)
      .values({
        caseNumber,
        processDefinitionId: input.processDefinitionId,
        title: input.title,
        priority: input.priority,
        initiatorId: input.initiatorId,
        participants: [input.initiatorId],
        metadata: input.metadata,
        dueAt: input.dueAt,
      })
      .returning();

    await addTimelineEvent(tx, {
      caseId: created.id,
      eventType: "case_created",
      actorId: input.initiatorId,
      data: {
        title: input.title,
        processDefinitionId: input.processDefinitionId,
      },
    });

    return created;
  });
}

function participantCondition(userId: string) {
  return sql`${cases.participants} @> ${JSON.stringify([userId])}::jsonb`;
}

export function listCases(filters: {
  // Restrict to cases the user started or takes part in
  visibleTo?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  processDefinitionId?: string;
}): Promise<Case[]> {
  const conditions = [];
  if (filters.visibleTo) {
    conditions.push(
      or(
        eq(cases.initiatorId, filters.visibleTo),
        participantCondition(filters.visibleTo)
      )
    );
  }
  if (filters.status) {
    conditions.push(eq(cases.status, filters.status));
  }
  if (filters.priority) {
    conditions.push(eq(cases.priority, filters.priority));
  }
  if (filters.processDefinitionId) {
    conditions.push(eq(cases.processDefinitionId, filters.processDefinitionId));
  }

  return db
    .select()
    .from(cases)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(cases.updatedAt));
}

export async function getCase(id: string): Promise<Case | null> {
  const [found] = await db.select().from(cases).where(eq(cases.id, id));
  return found ?? null;
}

export function canViewCase(viewer: CaseViewer, record: Case): boolean {
  return (
    viewer.role === "admin" ||
    record.initiatorId === viewer.id ||
    record.participants.includes(viewer.id)
  );
}

export async function getCaseDetail(record: Case): Promise<{
  case: Case;
  timeline: CaseTimelineEntry[];
  tasks: Task[];
}> {
  const [timeline, caseTasks] = await Promise.all([
    db
      .select()
      .from(caseTimeline)
      .where(eq(caseTimeline.caseId, record.id))
      .orderBy(desc(caseTimeline.createdAt)),
    record.processInstanceId
      ? db
          .select()
          .from(tasks)
          .where(eq(tasks.instanceId, record.processInstanceId))
          .orderBy(desc(tasks.createdAt))
      : Promise.resolve([] as Task[]),
  ]);

  return { case: record, timeline, tasks: caseTasks };
}

export type CasePatch = {
  title?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  participants?: string[];
  metadata?: Record<string, unknown>;
  dueAt?: Date | null;
};

export function updateCase(
  id: string,
  patch: CasePatch,
  actorId: string
): Promise<Case | null> {
  return db.transaction(async (tx) => {
    // Lock the row so the recorded "from" status is the one being replaced
    const [current] = await tx
      .select()
      .from(cases)
      .where(eq(cases.id, id))
      .for("update");
    if (!current) {
      return null;
    }

    const [updated] = await tx
      .update(cases)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(cases.id, id))
      .returning();

    if (patch.status && patch.status !== current.status) {
      await addTimelineEvent(tx, {
        caseId: id,
        eventType: "status_changed",
        actorId,
        data: { from: current.status, to: patch.status },
      });
    }

    const { status: _status, ...rest } = patch;
    const changedKeys = Object.keys(rest).filter(
      (key) => rest[key as keyof typeof rest] !== undefined
    );
    if (changedKeys.length > 0) {
      await addTimelineEvent(tx, {
        caseId: id,
        eventType: "case_updated",
        actorId,
        data: { changed: changedKeys },
      });
    }

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function getDepartmentIdOf(userId: string) {
  const [profile] = await db
    .select({ departmentId: userProfiles.departmentId })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId));
  return profile?.departmentId ?? null;
}

// Tasks assigned to the user, plus unclaimed tasks of the user's department
export async function listTasksForUser(
  userId: string,
  status?: TaskStatus
): Promise<Task[]> {
  const departmentId = await getDepartmentIdOf(userId);

  const mine = departmentId
    ? or(
        eq(tasks.assigneeId, userId),
        and(
          isNull(tasks.assigneeId),
          eq(tasks.assigneeDepartmentId, departmentId)
        )
      )
    : eq(tasks.assigneeId, userId);

  return db
    .select()
    .from(tasks)
    .where(status ? and(mine, eq(tasks.status, status)) : mine)
    .orderBy(desc(tasks.createdAt));
}

export async function getTask(id: string): Promise<Task | null> {
  const [found] = await db.select().from(tasks).where(eq(tasks.id, id));
  return found ?? null;
}

export function canActOnTask(
  viewer: CaseViewer,
  task: Task,
  viewerDepartmentId: string | null
): boolean {
  if (viewer.role === "admin" || task.assigneeId === viewer.id) {
    return true;
  }
  return (
    task.assigneeId === null &&
    viewerDepartmentId !== null &&
    task.assigneeDepartmentId === viewerDepartmentId
  );
}

async function findCaseIdForInstance(tx: Tx, instanceId: string) {
  const [found] = await tx
    .select({ id: cases.id })
    .from(cases)
    .where(eq(cases.processInstanceId, instanceId));
  return found?.id ?? null;
}

export type CompleteTaskResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "not_pending" };

// Only a pending task can be completed, and only once: the status check is
// part of the UPDATE, so two simultaneous submissions cannot both win.
export function completeTask(input: {
  task: Task;
  completedById: string;
  outcome: string | null;
  values: Record<string, unknown>;
}): Promise<CompleteTaskResult> {
  const { task } = input;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({
        status: "completed",
        outcome: input.outcome,
        completedById: input.completedById,
        completedAt: new Date(),
      })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, "pending")))
      .returning();
    if (!updated) {
      return { ok: false, reason: "not_pending" } as const;
    }

    const hasForm = (task.formFields as FormField[]).length > 0;
    if (hasForm) {
      await tx.insert(formSubmissions).values({
        instanceId: task.instanceId,
        taskId: task.id,
        submittedById: input.completedById,
        data: input.values,
      });
    }

    const caseId = await findCaseIdForInstance(tx, task.instanceId);
    if (caseId) {
      await addTimelineEvent(tx, {
        caseId,
        eventType: "task_completed",
        actorId: input.completedById,
        nodeId: task.nodeId,
        data: { name: task.name, outcome: input.outcome },
      });
      if (hasForm) {
        await addTimelineEvent(tx, {
          caseId,
          eventType: "form_submitted",
          actorId: input.completedById,
          nodeId: task.nodeId,
          data: { name: task.name },
        });
      }
    }

    return { ok: true, task: updated } as const;
  });
}

export type ReassignTaskResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "not_pending" };

export async function reassignTask(input: {
  task: Task;
  newAssigneeId: string;
  actorId: string;
}): Promise<ReassignTaskResult> {
  const { task } = input;

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({ assigneeId: input.newAssigneeId })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, "pending")))
      .returning();
    if (!updated) {
      return null;
    }

    const caseId = await findCaseIdForInstance(tx, task.instanceId);
    if (caseId) {
      await addTimelineEvent(tx, {
        caseId,
        eventType: "task_reassigned",
        actorId: input.actorId,
        nodeId: task.nodeId,
        data: { from: task.assigneeId, to: input.newAssigneeId },
      });
    }

    return { updated, caseId };
  });

  if (!result) {
    return { ok: false, reason: "not_pending" };
  }

  await createNotification({
    userId: input.newAssigneeId,
    type: "task_assigned",
    title: "A task was assigned to you",
    body: task.name,
    taskId: task.id,
    caseId: result.caseId,
  });

  return { ok: true, task: result.updated };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function createNotification(
  data: Omit<NewNotification, "id" | "createdAt" | "read">
) {
  const [created] = await db.insert(notifications).values(data).returning();
  pushNotificationToUser(created.userId, created);
  return created;
}

export function listNotifications(
  userId: string,
  options: { unreadOnly: boolean; limit: number }
) {
  return db
    .select()
    .from(notifications)
    .where(
      options.unreadOnly
        ? and(eq(notifications.userId, userId), eq(notifications.read, false))
        : eq(notifications.userId, userId)
    )
    .orderBy(desc(notifications.createdAt))
    .limit(options.limit);
}

export async function countUnreadNotifications(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return row?.count ?? 0;
}

export function markNotificationsRead(userId: string, ids: string[]) {
  return db
    .update(notifications)
    .set({ read: true })
    .where(
      and(eq(notifications.userId, userId), inArray(notifications.id, ids))
    );
}

export function markAllNotificationsRead(userId: string) {
  return db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}
