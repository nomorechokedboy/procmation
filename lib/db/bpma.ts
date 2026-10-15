/**
 * lib/db/bpma.ts
 * Database operations for BPMA entities
 */
import "server-only";

import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "./index";
import {
  type AssignmentRule,
  type CasePriority,
  type CaseStatus,
  type NewCase,
  type NewCaseTimeline,
  type NewNotification,
  type NewProcessDefinition,
  type NewProcessInstance,
  type NewTask,
  type TaskStatus,
  type TimelineEventType,
  caseTimeline,
  cases,
  notifications,
  processDefinitions,
  processInstances,
  processSteps,
  tasks,
  userProfiles,
  departments,
} from "./schema-bpma";

// ─────────────────────────────────────────────
// CASE NUMBER GENERATOR
// ─────────────────────────────────────────────

/** Generate a human-readable case number like CASE-2025-00042 */
export async function generateCaseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CASE-${year}-`;

  // Count existing cases this year
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cases)
    .where(sql`"case_number" LIKE ${prefix + "%"}`);

  const seq = (Number(result?.count ?? 0) + 1).toString().padStart(5, "0");
  return `${prefix}${seq}`;
}

// ─────────────────────────────────────────────
// PROCESS DEFINITIONS
// ─────────────────────────────────────────────

export async function createProcessDefinition(
  data: Omit<NewProcessDefinition, "id" | "createdAt" | "updatedAt">
) {
  const [result] = await db
    .insert(processDefinitions)
    .values(data)
    .returning();
  return result;
}

export async function getProcessDefinitions(filters?: {
  status?: "draft" | "active" | "archived";
  createdBy?: string;
}) {
  const conditions = [];
  if (filters?.status) conditions.push(eq(processDefinitions.status, filters.status));
  if (filters?.createdBy) conditions.push(eq(processDefinitions.createdBy, filters.createdBy));

  return db
    .select()
    .from(processDefinitions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(processDefinitions.updatedAt));
}

export async function getProcessDefinitionById(id: string) {
  const [result] = await db
    .select()
    .from(processDefinitions)
    .where(eq(processDefinitions.id, id))
    .limit(1);
  return result ?? null;
}

export async function getProcessDefinitionBySlugVersion(
  slug: string,
  version: number
) {
  const [result] = await db
    .select()
    .from(processDefinitions)
    .where(
      and(
        eq(processDefinitions.slug, slug),
        eq(processDefinitions.version, version)
      )
    )
    .limit(1);
  return result ?? null;
}

export async function updateProcessDefinition(
  id: string,
  data: Partial<Pick<
    NewProcessDefinition,
    "name" | "description" | "nodes" | "edges" | "status"
  >>
) {
  const [result] = await db
    .update(processDefinitions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(processDefinitions.id, id))
    .returning();
  return result ?? null;
}

/** Publish a process: bump version, set status=active */
export async function publishProcessDefinition(id: string, publishedBy: string) {
  const existing = await getProcessDefinitionById(id);
  if (!existing) return null;

  // Create a new version
  const [newDef] = await db
    .insert(processDefinitions)
    .values({
      slug: existing.slug,
      version: existing.version + 1,
      name: existing.name,
      description: existing.description,
      nodes: existing.nodes,
      edges: existing.edges,
      status: "active",
      createdBy: publishedBy,
    })
    .returning();

  // Archive the old one
  await db
    .update(processDefinitions)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(processDefinitions.id, id));

  return newDef;
}

// ─────────────────────────────────────────────
// CASES
// ─────────────────────────────────────────────

export async function createCase(
  data: Omit<NewCase, "id" | "caseNumber" | "createdAt" | "updatedAt">
) {
  const caseNumber = await generateCaseNumber();

  const [result] = await db
    .insert(cases)
    .values({ ...data, caseNumber })
    .returning();

  // Add timeline event
  await addTimelineEvent({
    caseId: result.id,
    eventType: "case_created",
    actorId: data.initiatorId,
    data: { title: data.title, processDefinitionId: data.processDefinitionId },
  });

  return result;
}

export async function getCases(filters?: {
  initiatorId?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  processDefinitionId?: string;
  assigneeId?: string; // cases where user has a task
}) {
  const conditions = [];
  if (filters?.initiatorId)
    conditions.push(eq(cases.initiatorId, filters.initiatorId));
  if (filters?.status) conditions.push(eq(cases.status, filters.status));
  if (filters?.priority) conditions.push(eq(cases.priority, filters.priority));
  if (filters?.processDefinitionId)
    conditions.push(eq(cases.processDefinitionId, filters.processDefinitionId));

  const result = await db
    .select()
    .from(cases)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(cases.updatedAt));

  // If filtering by assignee, join through tasks
  if (filters?.assigneeId) {
    const assignedTasks = await db
      .select({ caseId: tasks.caseId })
      .from(tasks)
      .where(eq(tasks.assigneeId, filters.assigneeId));
    const caseIds = new Set(assignedTasks.map((t) => t.caseId));
    return result.filter((c) => caseIds.has(c.id));
  }

  return result;
}

export async function getCaseById(id: string) {
  const [result] = await db
    .select()
    .from(cases)
    .where(eq(cases.id, id))
    .limit(1);
  return result ?? null;
}

export async function updateCase(
  id: string,
  data: Partial<
    Pick<NewCase, "status" | "priority" | "title" | "participants" | "metadata" | "dueAt">
  >,
  actorId?: string
) {
  const [result] = await db
    .update(cases)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(cases.id, id))
    .returning();

  if (result && (data.status || data.priority)) {
    await addTimelineEvent({
      caseId: id,
      eventType: "case_updated",
      actorId,
      data: { changes: data },
    });
  }

  return result ?? null;
}

export async function getCaseWithTimeline(caseId: string) {
  const caseRecord = await getCaseById(caseId);
  if (!caseRecord) return null;

  const timeline = await db
    .select()
    .from(caseTimeline)
    .where(eq(caseTimeline.caseId, caseId))
    .orderBy(desc(caseTimeline.createdAt));

  const caseTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.caseId, caseId))
    .orderBy(desc(tasks.createdAt));

  return { case: caseRecord, timeline, tasks: caseTasks };
}

// ─────────────────────────────────────────────
// CASE TIMELINE
// ─────────────────────────────────────────────

export async function addTimelineEvent(data: {
  caseId: string;
  eventType: TimelineEventType;
  actorId?: string;
  nodeId?: string;
  data?: Record<string, unknown>;
}) {
  const [result] = await db
    .insert(caseTimeline)
    .values({
      caseId: data.caseId,
      eventType: data.eventType,
      actorId: data.actorId,
      nodeId: data.nodeId,
      data: data.data ?? {},
    })
    .returning();
  return result;
}

// ─────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────

export async function createTask(
  data: Omit<NewTask, "id" | "createdAt" | "updatedAt">
) {
  const [result] = await db.insert(tasks).values(data).returning();

  await addTimelineEvent({
    caseId: data.caseId,
    eventType: "task_created",
    nodeId: data.nodeId,
    data: { stepLabel: data.stepLabel, assigneeId: data.assigneeId },
  });

  return result;
}

export async function getTasksForUser(userId: string, status?: TaskStatus) {
  const conditions = [eq(tasks.assigneeId, userId)];
  if (status) conditions.push(eq(tasks.status, status));

  return db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(tasks.dueAt, desc(tasks.createdAt));
}

export async function getTaskById(id: string) {
  const [result] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  return result ?? null;
}

export async function completeTask(
  taskId: string,
  completedBy: string,
  outcome?: Record<string, unknown>,
  formSubmissionId?: string
) {
  const task = await getTaskById(taskId);
  if (!task) return null;

  const [result] = await db
    .update(tasks)
    .set({
      status: "completed",
      outcome: outcome ?? {},
      formSubmissionId,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning();

  await addTimelineEvent({
    caseId: task.caseId,
    eventType: "task_completed",
    actorId: completedBy,
    nodeId: task.nodeId,
    data: { stepLabel: task.stepLabel, outcome },
  });

  return result;
}

export async function reassignTask(
  taskId: string,
  newAssigneeId: string,
  actorId: string
) {
  const task = await getTaskById(taskId);
  if (!task) return null;

  const [result] = await db
    .update(tasks)
    .set({ assigneeId: newAssigneeId, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();

  await addTimelineEvent({
    caseId: task.caseId,
    eventType: "task_reassigned",
    actorId,
    nodeId: task.nodeId,
    data: { from: task.assigneeId, to: newAssigneeId },
  });

  return result;
}

/** Get tasks that have exceeded their SLA deadline */
export async function getOverdueTasks() {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(tasks.status, ["pending", "in_progress"]),
        lt(tasks.dueAt, new Date())
      )
    );
}

// ─────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────

export async function createNotification(
  data: Omit<NewNotification, "id" | "createdAt">
) {
  const [result] = await db.insert(notifications).values(data).returning();
  return result;
}

export async function getNotificationsForUser(
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number }
) {
  const conditions = [eq(notifications.userId, userId)];
  if (options?.unreadOnly) conditions.push(eq(notifications.read, false));

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(options?.limit ?? 50);
}

export async function markNotificationsRead(userId: string, ids: string[]) {
  return db
    .update(notifications)
    .set({ read: true })
    .where(
      and(eq(notifications.userId, userId), inArray(notifications.id, ids))
    );
}

export async function markAllNotificationsRead(userId: string) {
  return db
    .update(notifications)
    .set({ read: true })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.read, false))
    );
}

export async function getUnreadNotificationCount(userId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.read, false))
    );
  return Number(result?.count ?? 0);
}

// ─────────────────────────────────────────────
// PROCESS INSTANCES
// ─────────────────────────────────────────────

export async function createProcessInstance(
  data: Omit<NewProcessInstance, "id" | "startedAt">
) {
  const [result] = await db.insert(processInstances).values(data).returning();
  return result;
}

export async function updateProcessInstance(
  id: string,
  data: Partial<
    Pick<
      NewProcessInstance,
      "status" | "currentNodeId" | "contextData" | "completedAt"
    >
  >
) {
  const [result] = await db
    .update(processInstances)
    .set(data)
    .where(eq(processInstances.id, id))
    .returning();
  return result ?? null;
}

export async function getProcessInstanceById(id: string) {
  const [result] = await db
    .select()
    .from(processInstances)
    .where(eq(processInstances.id, id))
    .limit(1);
  return result ?? null;
}

// ─────────────────────────────────────────────
// DEPARTMENTS
// ─────────────────────────────────────────────

export async function getDepartments() {
  return db.select().from(departments).orderBy(departments.name);
}

export async function createDepartment(name: string, parentId?: string) {
  const [result] = await db
    .insert(departments)
    .values({ name, parentId })
    .returning();
  return result;
}

// ─────────────────────────────────────────────
// USER PROFILES (BPMA extension)
// ─────────────────────────────────────────────

export async function getUserProfile(userId: string) {
  const [result] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return result ?? null;
}

export async function upsertUserProfile(
  userId: string,
  data: { departmentId?: string; managerId?: string; role?: string }
) {
  const [result] = await db
    .insert(userProfiles)
    .values({ userId, ...data })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return result;
}
