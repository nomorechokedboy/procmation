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

export async function finishInstanceStep(
  input: FinishInstanceInput
): Promise<void> {
  "use step";

  await db.transaction(async (tx) => {
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
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.processInstanceId, input.instanceId));
    if (!linkedCase) {
      return;
    }

    if (input.success) {
      const status = finalCaseStatus(input.outcome);
      await tx
        .update(cases)
        .set({ status, updatedAt: now })
        .where(eq(cases.id, linkedCase.id));
      await tx.insert(caseTimeline).values({
        caseId: linkedCase.id,
        data: { outcome: input.outcome, to: status },
        eventType: "status_changed",
      });
    } else {
      await tx.insert(caseTimeline).values({
        caseId: linkedCase.id,
        data: { error: input.error ?? "The process failed" },
        eventType: "case_updated",
      });
    }
  });
}
finishInstanceStep.maxRetries = 0;
