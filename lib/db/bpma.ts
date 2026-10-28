import { emitWebhookEvent } from "@/lib/webhooks/dispatch";
import "server-only";

import {
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { AUDIT_RESOURCES, type AuditEntry, recordAudit } from "@/lib/audit";
import { CASE_ACTIVE_STATUSES } from "@/lib/db/case-options";
import { pushNotificationToUser } from "@/lib/notifications/sse-hub";
import type { Permission } from "@/lib/permissions";
import { teamCaseCondition } from "@/lib/team-sql";
import type { FormField } from "@/lib/types/process-form";
import { db } from "./index";
import {
  type Case,
  type CasePriority,
  type CaseStatus,
  type CaseTimelineEntry,
  cases,
  caseTimeline,
  departments,
  formSubmissions,
  type NewNotification,
  notifications,
  processDefinitions,
  processInstances,
  processVersions,
  type Task,
  type TaskStatus,
  type TimelineEventType,
  tasks,
  userProfiles,
  users,
  workflowExecutions,
  workflows,
} from "./schema";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Who did something, as recorded in the audit log
export type Actor = { id: string; name: string };

export type CaseViewer = {
  id: string;
  role: string;
  permissions: Permission[];
};

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
    actorId: event.actorId ?? null,
    caseId: event.caseId,
    data: event.data ?? {},
    eventType: event.eventType,
    nodeId: event.nodeId ?? null,
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

export type NewCaseInput = {
  processDefinitionId: string;
  title: string;
  priority: CasePriority;
  initiatorId: string;
  metadata: Record<string, unknown>;
  dueAt: Date | null;
};

export async function createCaseInTx(
  tx: Tx,
  input: NewCaseInput,
  actor: Actor,
  // Collects what to log; the caller records it once the transaction commits
  audits: AuditEntry[]
): Promise<Case> {
  const caseNumber = await nextCaseNumber(tx);
  const [created] = await tx
    .insert(cases)
    .values({
      caseNumber,
      dueAt: input.dueAt,
      initiatorId: input.initiatorId,
      metadata: input.metadata,
      participants: [input.initiatorId],
      priority: input.priority,
      processDefinitionId: input.processDefinitionId,
      title: input.title,
    })
    .returning();

  await addTimelineEvent(tx, {
    actorId: input.initiatorId,
    caseId: created.id,
    data: {
      processDefinitionId: input.processDefinitionId,
      title: input.title,
    },
    eventType: "case_created",
  });
  audits.push({
    action: "created",
    actor,
    metadata: {
      priority: input.priority,
      processDefinitionId: input.processDefinitionId,
    },
    resourceId: created.id,
    resourceLabel: created.caseNumber,
    resourceType: AUDIT_RESOURCES.case,
    summary: `${actor.name} started case ${created.caseNumber}: ${input.title}`,
  });

  return created;
}

function participantCondition(userId: string) {
  return sql`${cases.participants} @> ${JSON.stringify([userId])}::jsonb`;
}

export type CaseFilters = {
  // Restrict to cases the user started or takes part in
  visibleTo?: string;
  // Restrict to cases of people who report to this manager
  teamOf?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  processDefinitionId?: string;
  // Words to find in the title, number, requester name or any answer
  q?: string;
  // Created on or after / before the end of these days (UTC)
  from?: Date;
  to?: Date;
  // Still running and past their due date
  overdue?: boolean;
};

const LIKE_SPECIALS = /[\\%_]/g;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Free-text search over what a person would remember about a case
function searchCondition(q: string): SQL {
  const like = `%${q.replace(LIKE_SPECIALS, "\\$&")}%`;
  return sql`(
    ${cases.title} ILIKE ${like}
    OR ${cases.caseNumber} ILIKE ${like}
    OR ${cases.metadata}::text ILIKE ${like}
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = ${cases.initiatorId} AND u.name ILIKE ${like})
    OR EXISTS (SELECT 1 FROM form_submissions f WHERE f.instance_id = ${cases.processInstanceId} AND f.data::text ILIKE ${like})
  )`;
}

function filterConditions(filters: CaseFilters): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = [];
  if (filters.teamOf) {
    conditions.push(teamCaseCondition(filters.teamOf));
  }
  if (filters.q) {
    conditions.push(searchCondition(filters.q));
  }
  if (filters.from) {
    conditions.push(gte(cases.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(
      lt(cases.createdAt, new Date(filters.to.getTime() + ONE_DAY_MS))
    );
  }
  if (filters.overdue) {
    conditions.push(
      and(
        inArray(cases.status, CASE_ACTIVE_STATUSES),
        sql`${cases.dueAt} < now()`
      )
    );
  }
  return conditions;
}

export function listCases(filters: CaseFilters): Promise<Case[]> {
  const conditions: (SQL | undefined)[] = filterConditions(filters);
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
    viewer.permissions.includes("cases.view_all") ||
    record.initiatorId === viewer.id ||
    record.participants.includes(viewer.id)
  );
}

// Anyone who started the case, takes part in it, or has (or had) a task on it
// can open it. Task assignees are not added to `participants`, so that My cases
// keeps listing only the requests a person started.
export async function canAccessCase(
  viewer: CaseViewer,
  record: Case
): Promise<boolean> {
  if (canViewCase(viewer, record)) {
    return true;
  }
  if (!record.processInstanceId) {
    return false;
  }

  const departmentId = await getDepartmentIdOf(viewer.id);
  const involved = or(
    eq(tasks.assigneeId, viewer.id),
    eq(tasks.completedById, viewer.id),
    departmentId
      ? and(
          isNull(tasks.assigneeId),
          eq(tasks.assigneeDepartmentId, departmentId)
        )
      : undefined
  );
  const [found] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.instanceId, record.processInstanceId), involved))
    .limit(1);
  return Boolean(found);
}

export type CaseDetailData = {
  case: Case;
  timeline: CaseTimelineEntry[];
  tasks: Task[];
  // Names for every user and department the page mentions
  people: Record<string, string>;
  departments: Record<string, string>;
  process: {
    name: string;
    startFormFields: FormField[];
    // The published version this case runs; null for cases older than versions
    version: number | null;
  } | null;
  // What each task's form received, by task id
  submissions: Record<string, Record<string, unknown>>;
};

function timelineUserIds(entries: CaseTimelineEntry[]): string[] {
  const ids: string[] = [];
  for (const entry of entries) {
    ids.push(entry.actorId ?? "");
    for (const key of ["assigneeId", "escalatedToId", "from", "to"]) {
      const value = entry.data[key];
      // "from"/"to" hold user ids only for reassignments
      if (
        typeof value === "string" &&
        (key === "assigneeId" ||
          key === "escalatedToId" ||
          entry.eventType === "task_reassigned" ||
          entry.eventType === "task_delegated")
      ) {
        ids.push(value);
      }
    }
  }
  return ids;
}

export async function getCaseDetail(record: Case): Promise<CaseDetailData> {
  const instanceId = record.processInstanceId;
  const [timeline, caseTasks, submissionRows, definition] = await Promise.all([
    db
      .select()
      .from(caseTimeline)
      .where(eq(caseTimeline.caseId, record.id))
      .orderBy(desc(caseTimeline.createdAt)),
    instanceId
      ? db
          .select()
          .from(tasks)
          .where(eq(tasks.instanceId, instanceId))
          .orderBy(desc(tasks.createdAt))
      : Promise.resolve([] as Task[]),
    instanceId
      ? db
          .select({
            data: formSubmissions.data,
            taskId: formSubmissions.taskId,
          })
          .from(formSubmissions)
          .where(eq(formSubmissions.instanceId, instanceId))
      : Promise.resolve([]),
    // The case shows its own version, so a later edit never rewrites its history
    db
      .select({
        name: sql<string>`coalesce(${processVersions.name}, ${workflows.name})`,
        startFormFields: sql<
          FormField[]
        >`coalesce(${processVersions.startFormFields}, ${processDefinitions.startFormFields})`,
        version: processVersions.version,
      })
      .from(processDefinitions)
      .innerJoin(workflows, eq(processDefinitions.workflowId, workflows.id))
      .leftJoin(processInstances, eq(processInstances.id, instanceId ?? ""))
      .leftJoin(
        processVersions,
        eq(processVersions.id, processInstances.versionId)
      )
      .where(eq(processDefinitions.id, record.processDefinitionId)),
  ]);

  const userIds = new Set(
    [
      record.initiatorId,
      ...timelineUserIds(timeline),
      ...caseTasks.flatMap((task) => [
        task.assigneeId ?? "",
        task.completedById ?? "",
        task.escalatedToId ?? "",
      ]),
    ].filter(Boolean)
  );
  const departmentIds = new Set(
    caseTasks.map((task) => task.assigneeDepartmentId ?? "").filter(Boolean)
  );

  const [userRows, departmentRows] = await Promise.all([
    userIds.size > 0
      ? db
          .select({ email: users.email, id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, [...userIds]))
      : Promise.resolve([]),
    departmentIds.size > 0
      ? db
          .select({ id: departments.id, name: departments.name })
          .from(departments)
          .where(inArray(departments.id, [...departmentIds]))
      : Promise.resolve([]),
  ]);

  const submissions: Record<string, Record<string, unknown>> = {};
  for (const row of submissionRows) {
    if (row.taskId) {
      submissions[row.taskId] = row.data;
    }
  }

  return {
    case: record,
    departments: Object.fromEntries(departmentRows.map((d) => [d.id, d.name])),
    people: Object.fromEntries(
      userRows.map((u) => [u.id, u.name || u.email || ""])
    ),
    process: definition[0]
      ? {
          name: definition[0].name,
          startFormFields: definition[0].startFormFields as FormField[],
          version: definition[0].version,
        }
      : null,
    submissions,
    tasks: caseTasks,
    timeline,
  };
}

export type CancelCaseResult =
  | { ok: true; runId: string | null; record: Case }
  | { ok: false; reason: "not_active" };

// Stops a case: closes its waiting tasks and marks the case and process
// cancelled. The caller then stops the suspended run, see cancelCaseRun.
export async function cancelCase(input: {
  caseId: string;
  actor: Actor;
}): Promise<CancelCaseResult> {
  const audits: AuditEntry[] = [];
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(cases)
      .where(eq(cases.id, input.caseId))
      .for("update");
    if (!(current && CASE_ACTIVE_STATUSES.includes(current.status))) {
      return { ok: false, reason: "not_active" } as const;
    }

    const now = new Date();
    const [record] = await tx
      .update(cases)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(cases.id, current.id))
      .returning();

    let runId: string | null = null;
    if (current.processInstanceId) {
      const [instance] = await tx
        .update(processInstances)
        .set({ completedAt: now, status: "cancelled", updatedAt: now })
        .where(eq(processInstances.id, current.processInstanceId))
        .returning({
          executionId: processInstances.workflowExecutionId,
          runId: processInstances.runId,
        });
      runId = instance?.runId ?? null;

      await tx
        .update(tasks)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(tasks.instanceId, current.processInstanceId),
            eq(tasks.status, "pending")
          )
        );
      if (instance?.executionId) {
        await tx
          .update(workflowExecutions)
          .set({ completedAt: now, status: "cancelled" })
          .where(eq(workflowExecutions.id, instance.executionId));
      }
    }

    await addTimelineEvent(tx, {
      actorId: input.actor.id,
      caseId: current.id,
      data: { from: current.status, to: "cancelled" },
      eventType: "status_changed",
    });
    audits.push({
      action: "cancelled",
      actor: input.actor,
      metadata: { from: current.status },
      resourceId: current.id,
      resourceLabel: current.caseNumber,
      resourceType: AUDIT_RESOURCES.case,
      summary: `${input.actor.name} cancelled case ${current.caseNumber}`,
    });

    return { ok: true, record, runId } as const;
  });
  recordAudit(audits);
  if (result.ok) {
    emitWebhookEvent("case.cancelled", { caseId: input.caseId });
  }
  return result;
}

export type CasePatch = {
  title?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  participants?: string[];
  metadata?: Record<string, unknown>;
  dueAt?: Date | null;
};

export async function updateCase(
  id: string,
  patch: CasePatch,
  actor: Actor
): Promise<Case | null> {
  const audits: AuditEntry[] = [];
  const result = await db.transaction(async (tx) => {
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
        actorId: actor.id,
        caseId: id,
        data: { from: current.status, to: patch.status },
        eventType: "status_changed",
      });
      audits.push({
        action: "status_changed",
        actor,
        metadata: { from: current.status, to: patch.status },
        resourceId: id,
        resourceLabel: current.caseNumber,
        resourceType: AUDIT_RESOURCES.case,
        summary: `${actor.name} changed case ${current.caseNumber} from ${current.status} to ${patch.status}`,
      });
    }

    const { status: _status, ...rest } = patch;
    const changedKeys = Object.keys(rest).filter(
      (key) => rest[key as keyof typeof rest] !== undefined
    );
    if (changedKeys.length > 0) {
      await addTimelineEvent(tx, {
        actorId: actor.id,
        caseId: id,
        data: { changed: changedKeys },
        eventType: "case_updated",
      });
      audits.push({
        action: "updated",
        actor,
        metadata: { changed: changedKeys },
        resourceId: id,
        resourceLabel: current.caseNumber,
        resourceType: AUDIT_RESOURCES.case,
        summary: `${actor.name} updated ${changedKeys.join(", ")} on case ${current.caseNumber}`,
      });
    }

    return updated;
  });
  recordAudit(audits);
  return result;
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
// A task together with the case it belongs to, for lists and the task page
export type TaskWithCase = Task & {
  caseId: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
};

const taskWithCaseSelection = {
  ...getTableColumns(tasks),
  caseId: cases.id,
  caseNumber: cases.caseNumber,
  caseTitle: cases.title,
};

export async function listTasksForUser(
  userId: string,
  status?: TaskStatus
): Promise<TaskWithCase[]> {
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
    .select(taskWithCaseSelection)
    .from(tasks)
    .leftJoin(cases, eq(cases.processInstanceId, tasks.instanceId))
    .where(status ? and(mine, eq(tasks.status, status)) : mine)
    .orderBy(desc(tasks.createdAt));
}

export async function getTask(id: string): Promise<TaskWithCase | null> {
  const [found] = await db
    .select(taskWithCaseSelection)
    .from(tasks)
    .leftJoin(cases, eq(cases.processInstanceId, tasks.instanceId))
    .where(eq(tasks.id, id));
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

export async function findCaseForInstance(tx: Tx, instanceId: string) {
  const [found] = await tx
    .select({ caseNumber: cases.caseNumber, id: cases.id })
    .from(cases)
    .where(eq(cases.processInstanceId, instanceId));
  return found ?? null;
}

export type CompleteTaskResult =
  | { ok: true; task: Task; caseId: string | null }
  | { ok: false; reason: "not_pending" };

// Only a pending task can be completed, and only once: the status check is
// part of the UPDATE, so two simultaneous submissions cannot both win.
export async function completeTask(input: {
  task: Task;
  actor: Actor;
  completedById: string;
  outcome: string | null;
  values: Record<string, unknown>;
}): Promise<CompleteTaskResult> {
  const { task } = input;

  const audits: AuditEntry[] = [];
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({
        completedAt: new Date(),
        completedById: input.completedById,
        outcome: input.outcome,
        status: "completed",
      })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, "pending")))
      .returning();
    if (!updated) {
      return { ok: false, reason: "not_pending" } as const;
    }

    const hasForm = (task.formFields as FormField[]).length > 0;
    if (hasForm) {
      await tx.insert(formSubmissions).values({
        data: input.values,
        instanceId: task.instanceId,
        submittedById: input.completedById,
        taskId: task.id,
      });
    }

    // The run continues once no other task of the instance is waiting
    const [stillPending] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(eq(tasks.instanceId, task.instanceId), eq(tasks.status, "pending"))
      )
      .limit(1);
    if (!stillPending) {
      await tx
        .update(processInstances)
        .set({ status: "running", updatedAt: new Date() })
        .where(
          and(
            eq(processInstances.id, task.instanceId),
            eq(processInstances.status, "waiting")
          )
        );
    }

    const linked = await findCaseForInstance(tx, task.instanceId);
    const caseId = linked?.id ?? null;
    audits.push({
      action: "completed",
      actor: input.actor,
      metadata: { outcome: input.outcome },
      parent: linked
        ? { id: linked.id, label: linked.caseNumber, type: "case" }
        : undefined,
      resourceId: task.id,
      resourceLabel: task.name,
      resourceType: AUDIT_RESOURCES.task,
      summary: `${input.actor.name} completed "${task.name}"${
        input.outcome ? ` with outcome ${input.outcome}` : ""
      }`,
    });
    if (caseId) {
      await addTimelineEvent(tx, {
        actorId: input.completedById,
        caseId,
        data: { name: task.name, outcome: input.outcome },
        eventType: "task_completed",
        nodeId: task.nodeId,
      });
      if (hasForm) {
        await addTimelineEvent(tx, {
          actorId: input.completedById,
          caseId,
          data: { name: task.name },
          eventType: "form_submitted",
          nodeId: task.nodeId,
        });
      }
    }

    return { caseId, ok: true, task: updated } as const;
  });
  recordAudit(audits);
  if (result.ok && result.caseId) {
    emitWebhookEvent("task.completed", {
      caseId: result.caseId,
      taskId: result.task.id,
    });
  }
  return result;
}

// Undo a completion when the run could not be resumed, so the task is not
// left finished while the process is still waiting for it.
export async function reopenTask(task: Task): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(formSubmissions).where(eq(formSubmissions.taskId, task.id));
    await tx
      .update(tasks)
      .set({
        completedAt: null,
        completedById: null,
        outcome: null,
        status: "pending",
      })
      .where(eq(tasks.id, task.id));
    await tx
      .update(processInstances)
      .set({ status: "waiting", updatedAt: new Date() })
      .where(
        and(
          eq(processInstances.id, task.instanceId),
          eq(processInstances.status, "running")
        )
      );
  });
}

export type ReassignTaskResult =
  | { ok: true; task: Task; caseId: string | null }
  | { ok: false; reason: "not_pending" };

export async function reassignTask(input: {
  task: Task;
  newAssigneeId: string;
  actor: Actor;
}): Promise<ReassignTaskResult> {
  const { task } = input;

  const audits: AuditEntry[] = [];
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({ assigneeId: input.newAssigneeId })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, "pending")))
      .returning();
    if (!updated) {
      return null;
    }

    const linked = await findCaseForInstance(tx, task.instanceId);
    const caseId = linked?.id ?? null;
    if (caseId) {
      await addTimelineEvent(tx, {
        actorId: input.actor.id,
        caseId,
        data: { from: task.assigneeId, to: input.newAssigneeId },
        eventType: "task_reassigned",
        nodeId: task.nodeId,
      });
    }

    const people = await tx
      .select({ email: users.email, id: users.id, name: users.name })
      .from(users)
      .where(
        inArray(
          users.id,
          [task.assigneeId, input.newAssigneeId].filter(
            (id): id is string => id !== null
          )
        )
      );
    const nameOf = (id: string | null) => {
      const person = people.find((item) => item.id === id);
      return person?.name || person?.email || "nobody";
    };
    audits.push({
      action: "reassigned",
      actor: input.actor,
      metadata: { from: task.assigneeId, to: input.newAssigneeId },
      parent: linked
        ? { id: linked.id, label: linked.caseNumber, type: "case" }
        : undefined,
      resourceId: task.id,
      resourceLabel: task.name,
      resourceType: AUDIT_RESOURCES.task,
      summary: `${input.actor.name} reassigned "${task.name}" from ${nameOf(task.assigneeId)} to ${nameOf(input.newAssigneeId)}`,
    });

    return { caseId, updated };
  });

  recordAudit(audits);

  if (!result) {
    return { ok: false, reason: "not_pending" };
  }

  return { caseId: result.caseId, ok: true, task: result.updated };
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
    .where(
      and(eq(notifications.userId, userId), eq(notifications.read, false))
    );
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
    .where(
      and(eq(notifications.userId, userId), eq(notifications.read, false))
    );
}
