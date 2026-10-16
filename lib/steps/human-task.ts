/**
 * Executable step for the Human Task action: opens a task for a person or a
 * department and records it on the case. The workflow then waits on a hook
 * until the task is completed through the API.
 */
import "server-only";

import { and, eq } from "drizzle-orm";
import { createNotification } from "@/lib/db/bpma";
import { db } from "@/lib/db";
import {
  caseTimeline,
  cases,
  departments,
  processInstances,
  tasks,
  userProfiles,
  users,
} from "@/lib/db/schema";
import type { TaskOutcome } from "@/lib/types/human-task";
import type { AssigneeType } from "@/lib/types/human-task";
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
};

export type HumanTaskOpened = {
  taskId: string;
  assigneeId: string | null;
  assigneeDepartmentId: string | null;
};

type Assignee = { userId: string | null; departmentId: string | null };

async function resolveAssignee(input: HumanTaskStepInput): Promise<Assignee> {
  if (input.assigneeType === "user") {
    if (!input.assigneeUserId) {
      throw new Error(`Task "${input.name}" has no person selected`);
    }
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.assigneeUserId));
    if (!user) {
      throw new Error(`The person assigned to "${input.name}" no longer exists`);
    }
    return { userId: user.id, departmentId: null };
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
    return { userId: null, departmentId: department.id };
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
  return { userId: row.managerId, departmentId: null };
}

async function openTask(input: HumanTaskStepInput): Promise<HumanTaskOpened> {
  const assignee = await resolveAssignee(input);

  const opened = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(tasks)
      .values({
        instanceId: input.instanceId,
        nodeId: input.nodeId,
        name: input.name,
        assigneeId: assignee.userId,
        assigneeDepartmentId: assignee.departmentId,
        formFields: input.formFields,
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
      return { task: existing, caseId: null, isNew: false };
    }

    await tx
      .update(processInstances)
      .set({ status: "waiting", updatedAt: new Date() })
      .where(eq(processInstances.id, input.instanceId));

    const [linkedCase] = await tx
      .select({ id: cases.id, status: cases.status })
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
        eventType: "task_created",
        nodeId: input.nodeId,
        data: {
          name: input.name,
          assigneeId: assignee.userId,
          assigneeDepartmentId: assignee.departmentId,
        },
      });
    }

    return { task: created, caseId: linkedCase?.id ?? null, isNew: true };
  });

  if (opened.isNew && assignee.userId) {
    await createNotification({
      userId: assignee.userId,
      type: "task_assigned",
      title: "A task is waiting for you",
      body: input.name,
      taskId: opened.task.id,
      caseId: opened.caseId,
    });
  }

  return {
    taskId: opened.task.id,
    assigneeId: opened.task.assigneeId,
    assigneeDepartmentId: opened.task.assigneeDepartmentId,
  };
}

export async function createHumanTaskStep(
  input: HumanTaskStepInput
): Promise<HumanTaskOpened> {
  "use step";
  return withStepLogging(input, () => openTask(input));
}
createHumanTaskStep.maxRetries = 0;
