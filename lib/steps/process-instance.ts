/**
 * Steps that keep the process instance and its case in step with the run.
 */
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  type CaseStatus,
  cases,
  caseTimeline,
  processInstances,
} from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications/deliver";

export type FinishInstanceInput = {
  instanceId: string;
  success: boolean;
  // The id of the last outcome a person chose, such as "approve" or "reject"
  outcome: string | null;
  error?: string;
};

function finalCaseStatus(outcome: string | null): CaseStatus {
  if (outcome === "reject") {
    return "rejected";
  }
  if (outcome === "approve") {
    return "approved";
  }
  return "completed";
}

type FinishedCase = {
  id: string;
  caseNumber: string;
  title: string;
  initiatorId: string;
  status: CaseStatus;
};

export async function finishInstanceStep(
  input: FinishInstanceInput
): Promise<void> {
  "use step";

  const finished = await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(processInstances)
      .set({
        completedAt: now,
        outcome: input.outcome,
        status: input.success ? "completed" : "failed",
        updatedAt: now,
      })
      .where(eq(processInstances.id, input.instanceId));

    const [linkedCase] = await tx
      .select({
        caseNumber: cases.caseNumber,
        id: cases.id,
        initiatorId: cases.initiatorId,
        status: cases.status,
        title: cases.title,
      })
      .from(cases)
      .where(eq(cases.processInstanceId, input.instanceId))
      .for("update");
    // An administrator may have cancelled the case while the run was ending
    if (!linkedCase || linkedCase.status === "cancelled") {
      return null;
    }

    const status: CaseStatus = input.success
      ? finalCaseStatus(input.outcome)
      : "failed";
    await tx
      .update(cases)
      .set({ status, updatedAt: now })
      .where(eq(cases.id, linkedCase.id));
    await tx.insert(caseTimeline).values({
      caseId: linkedCase.id,
      data: input.success
        ? { from: linkedCase.status, outcome: input.outcome, to: status }
        : {
            error: input.error ?? "The process failed",
            from: linkedCase.status,
            to: status,
          },
      eventType: "status_changed",
    });
    return { ...linkedCase, status } satisfies FinishedCase;
  });

  if (finished) {
    await notifyUser({
      caseId: finished.id,
      caseNumber: finished.caseNumber,
      caseTitle: finished.title,
      status: finished.status,
      type: finished.status === "failed" ? "case_failed" : "case_completed",
      userId: finished.initiatorId,
    });
  }
}
finishInstanceStep.maxRetries = 0;
