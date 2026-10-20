/**
 * Executable step for the Human Task action: opens a task for a person or a
 * department and records it on the case. The workflow then waits on a hook
 * until the task is completed through the API.
 */
import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cases,
  caseTimeline,
  departments,
  processInstances,
  tasks,
  userProfiles,
  users,
} from "@/lib/db/schema";
import { activeDelegateFor } from "@/lib/delegations";
import { computeDueAt } from "@/lib/due";
import { notifyUser } from "@/lib/notifications/deliver";
import type {
  AssigneeType,
  DueUnit,
  TaskOutcome,
} from "@/lib/types/human-task";
import type { FormField } from "@/lib/types/process-form";
import { type StepInput, withStepLogging } from "./step-handler";

export type HumanTaskStepInput = StepInput & {
  instanceId: string;
  nodeId: string;
  name: string;
  assigneeType: AssigneeType;
  assigneeUserId?: string;
  assigneeDepartmentId?: string;
  formFields: FormField[];
  outcomes: TaskOutcome[];
  dueAmount?: number | string;
  dueUnit?: DueUnit;
};

export type HumanTaskOpened = {
  taskId: string;
  assigneeId: string | null;
  assigneeDepartmentId: string | null;
};

type Assignee = {
  userId: string | null;
  departmentId: string | null;
  // Set when a delegation sent the task to someone else
  delegatedFromId?: string;
};

// If the person is away, the task goes to whoever covers for them. Only new
// tasks are affected: tasks that already exist keep their assignee.
async function applyDelegation(assignee: Assignee): Promise<Assignee> {
  if (!assignee.userId) {
    return assignee;
  }
  const delegateId = await activeDelegateFor(assignee.userId, new Date());
  return delegateId
    ? { ...assignee, delegatedFromId: assignee.userId, userId: delegateId }
    : assignee;
}

async function resolveWho(input: HumanTaskStepInput): Promise<Assignee> {
  if (input.assigneeType === "user") {
    if (!input.assigneeUserId) {
      throw new Error(`Task "${input.name}" has no person selected`);
    }
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.assigneeUserId));
    if (!user) {
      throw new Error(
        `The person assigned to "${input.name}" no longer exists`
      );
    }
    return { departmentId: null, userId: user.id };
  }

  if (input.assigneeType === "department") {
    if (!input.assigneeDepartmentId) {
      throw new Error(`Task "${input.name}" has no department selected`);
    }
    const [department] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.id, input.assigneeDepartmentId));
    if (!department) {
      throw new Error(
        `The department assigned to "${input.name}" no longer exists`
      );
    }
    return { departmentId: department.id, userId: null };
  }

  // The manager of whoever started the process
  const [row] = await db
    .select({ managerId: userProfiles.managerId })
    .from(processInstances)
    .leftJoin(
      userProfiles,
      eq(userProfiles.userId, processInstances.requesterId)
    )
    .where(eq(processInstances.id, input.instanceId));
  if (!row?.managerId) {
    throw new Error(
      `Task "${input.name}" is assigned to the requester's manager, but the requester has no manager set`
    );
  }
  return { departmentId: null, userId: row.managerId };
}

async function resolveAssignee(input: HumanTaskStepInput): Promise<Assignee> {
  return applyDelegation(await resolveWho(input));
}

async function openTask(input: HumanTaskStepInput): Promise<HumanTaskOpened> {
  const assignee = await resolveAssignee(input);

  const opened = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(tasks)
      .values({
        assigneeDepartmentId: assignee.departmentId,
        assigneeId: assignee.userId,
        delegatedFromId: assignee.delegatedFromId ?? null,
        dueAt: computeDueAt(input.dueAmount, input.dueUnit, new Date()),
        formFields: input.formFields,
        instanceId: input.instanceId,
        name: input.name,
        nodeId: input.nodeId,
        outcomes: input.outcomes,
      })
      .onConflictDoNothing()
      .returning();

    // A retried step finds the task it already opened
    if (!created) {
      const [existing] = await tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.instanceId, input.instanceId),
            eq(tasks.nodeId, input.nodeId)
          )
        );
      return { case: null, isNew: false, task: existing };
    }

    await tx
      .update(processInstances)
      .set({ status: "waiting", updatedAt: new Date() })
      .where(eq(processInstances.id, input.instanceId));

    const [linkedCase] = await tx
      .select({
        caseNumber: cases.caseNumber,
        id: cases.id,
        status: cases.status,
        title: cases.title,
      })
      .from(cases)
      .where(eq(cases.processInstanceId, input.instanceId));

    if (linkedCase) {
      if (linkedCase.status === "open") {
        await tx
          .update(cases)
          .set({ status: "in_progress", updatedAt: new Date() })
          .where(eq(cases.id, linkedCase.id));
      }
      await tx.insert(caseTimeline).values({
        caseId: linkedCase.id,
        data: {
          assigneeDepartmentId: assignee.departmentId,
          assigneeId: assignee.userId,
          name: input.name,
        },
        eventType: "task_created",
        nodeId: input.nodeId,
      });
      if (assignee.delegatedFromId) {
        await tx.insert(caseTimeline).values({
          caseId: linkedCase.id,
          data: {
            from: assignee.delegatedFromId,
            name: input.name,
            to: assignee.userId,
          },
          eventType: "task_delegated",
          nodeId: input.nodeId,
        });
      }
    }

    return { case: linkedCase ?? null, isNew: true, task: created };
  });

  if (opened.isNew && assignee.userId) {
    await notifyUser({
      caseId: opened.case?.id ?? null,
      caseNumber: opened.case?.caseNumber ?? "",
      caseTitle: opened.case?.title ?? "",
      taskId: opened.task.id,
      taskName: input.name,
      type: "task_assigned",
      userId: assignee.userId,
    });
  }

  return {
    assigneeDepartmentId: opened.task.assigneeDepartmentId,
    assigneeId: opened.task.assigneeId,
    taskId: opened.task.id,
  };
}

// biome-ignore lint/suspicious/useAwait: workflow "use step" requires async
export async function createHumanTaskStep(
  input: HumanTaskStepInput
): Promise<HumanTaskOpened> {
  "use step";
  return withStepLogging(input, () => openTask(input));
}
createHumanTaskStep.maxRetries = 0;
