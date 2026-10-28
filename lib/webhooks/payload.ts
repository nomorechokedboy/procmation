import "server-only";

import { eq } from "drizzle-orm";
import { getAppOrigin } from "@/lib/app-url";
import { db } from "@/lib/db";
import {
  cases,
  processDefinitions,
  processInstances,
  processVersions,
  tasks,
  users,
  workflows,
} from "@/lib/db/schema";
import type { WebhookEventType } from "@/lib/webhooks/events";

export type EventRef = { caseId: string; taskId?: string };

export type EventPayload = {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
};

async function loadCase(caseId: string) {
  const [row] = await db
    .select({
      caseNumber: cases.caseNumber,
      dueAt: cases.dueAt,
      id: cases.id,
      initiatorEmail: users.email,
      initiatorId: users.id,
      initiatorName: users.name,
      priority: cases.priority,
      processId: processDefinitions.id,
      processName: workflows.name,
      status: cases.status,
      title: cases.title,
      version: processVersions.version,
    })
    .from(cases)
    .innerJoin(
      processDefinitions,
      eq(processDefinitions.id, cases.processDefinitionId)
    )
    .innerJoin(workflows, eq(workflows.id, processDefinitions.workflowId))
    .innerJoin(users, eq(users.id, cases.initiatorId))
    .leftJoin(
      processInstances,
      eq(processInstances.id, cases.processInstanceId)
    )
    .leftJoin(
      processVersions,
      eq(processVersions.id, processInstances.versionId)
    )
    .where(eq(cases.id, caseId));
  return row;
}

async function loadTask(taskId: string) {
  const [row] = await db
    .select({
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      departmentId: tasks.assigneeDepartmentId,
      dueAt: tasks.dueAt,
      id: tasks.id,
      name: tasks.name,
      outcome: tasks.outcome,
      status: tasks.status,
    })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(eq(tasks.id, taskId));
  return row;
}

// What receivers get: a snapshot of the case (and task) at the time of the event
export async function buildEventPayload(
  eventId: string,
  type: WebhookEventType,
  ref: EventRef
): Promise<{ payload: EventPayload; processId: string } | null> {
  const record = await loadCase(ref.caseId);
  if (!record) {
    return null;
  }
  const task = ref.taskId ? await loadTask(ref.taskId) : undefined;
  const origin = getAppOrigin();
  return {
    payload: {
      createdAt: new Date().toISOString(),
      data: {
        case: {
          dueAt: record.dueAt?.toISOString() ?? null,
          id: record.id,
          initiator: {
            email: record.initiatorEmail,
            id: record.initiatorId,
            name: record.initiatorName,
          },
          number: record.caseNumber,
          priority: record.priority,
          process: {
            id: record.processId,
            name: record.processName,
            version: record.version,
          },
          status: record.status,
          title: record.title,
          url: `${origin}/cases/${record.id}`,
        },
        ...(task
          ? {
              task: {
                assignee: task.assigneeId
                  ? { id: task.assigneeId, name: task.assigneeName }
                  : null,
                assigneeDepartmentId: task.departmentId,
                dueAt: task.dueAt?.toISOString() ?? null,
                id: task.id,
                name: task.name,
                outcome: task.outcome,
                status: task.status,
              },
            }
          : {}),
      },
      id: eventId,
      type,
    },
    processId: record.processId,
  };
}
