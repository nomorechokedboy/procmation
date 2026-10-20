import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { AUDIT_RESOURCES, type AuditEntry, recordAudit } from "@/lib/audit";
import { type Actor, addTimelineEvent, findCaseForInstance } from "./bpma";
import { db } from "./index";
import { type Task, tasks } from "./schema";

export type ClaimResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "not_available" };

type Change = "claimed" | "released";

// Records who took a pool task or put it back, on the case and in the audit log
async function recordChange(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { change: Change; actor: Actor; task: Task },
  audits: AuditEntry[]
) {
  const { actor, change, task } = input;
  const linked = await findCaseForInstance(tx, task.instanceId);
  if (linked) {
    await addTimelineEvent(tx, {
      actorId: actor.id,
      caseId: linked.id,
      eventType: change === "claimed" ? "task_claimed" : "task_released",
      nodeId: task.nodeId,
    });
  }
  audits.push({
    action: change,
    actor,
    parent: linked
      ? { id: linked.id, label: linked.caseNumber, type: "case" }
      : undefined,
    resourceId: task.id,
    resourceLabel: task.name,
    resourceType: AUDIT_RESOURCES.task,
    summary: `${actor.name} ${change} "${task.name}"`,
  });
}

// A department member takes a pool task. The conditions are part of the
// UPDATE, so when two people claim at once exactly one of them wins.
export async function claimTask(input: {
  taskId: string;
  departmentId: string;
  actor: Actor;
}): Promise<ClaimResult> {
  const audits: AuditEntry[] = [];
  const claimed = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({ assigneeId: input.actor.id })
      .where(
        and(
          eq(tasks.id, input.taskId),
          eq(tasks.status, "pending"),
          isNull(tasks.assigneeId),
          eq(tasks.assigneeDepartmentId, input.departmentId)
        )
      )
      .returning();
    if (!updated) {
      return null;
    }
    await recordChange(
      tx,
      { actor: input.actor, change: "claimed", task: updated },
      audits
    );
    return updated;
  });

  recordAudit(audits);
  return claimed
    ? { ok: true, task: claimed }
    : { ok: false, reason: "not_available" };
}

// The person holding a pool task puts it back for the department (an admin
// can do it for them). Only tasks that came from a pool can go back.
export async function releaseTask(input: {
  taskId: string;
  holderId: string | null;
  actor: Actor;
}): Promise<ClaimResult> {
  const audits: AuditEntry[] = [];
  const released = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, input.taskId))
      .for("update");
    if (
      !(
        current &&
        current.status === "pending" &&
        current.assigneeDepartmentId &&
        current.assigneeId &&
        (input.holderId === null || current.assigneeId === input.holderId)
      )
    ) {
      return null;
    }
    const [updated] = await tx
      .update(tasks)
      .set({ assigneeId: null })
      .where(eq(tasks.id, current.id))
      .returning();
    await recordChange(
      tx,
      { actor: input.actor, change: "released", task: updated },
      audits
    );
    return updated;
  });

  recordAudit(audits);
  return released
    ? { ok: true, task: released }
    : { ok: false, reason: "not_available" };
}
