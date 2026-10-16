import "server-only";

import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { type NewCaseInput, createCaseInTx } from "@/lib/db/bpma";
import { db } from "@/lib/db";
import {
  type Case,
  cases,
  formSubmissions,
  processInstances,
  workflowExecutions,
  workflows,
} from "@/lib/db/schema";
import { executeWorkflow } from "@/lib/workflow-executor.workflow";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow-store";

export type StartCaseInput = NewCaseInput & {
  workflowId: string;
  // Validated answers to the process start form
  startValues: Record<string, unknown>;
  requester: { id: string; name: string; email: string };
};

/**
 * Opens a case for a process and starts its workflow. The case, the process
 * instance, the run record shown in the Runs tab and the start form answers
 * are created together, then the run is handed to the workflow engine.
 */
export async function startProcessCase(input: StartCaseInput): Promise<Case> {
  const [workflow] = await db
    .select({
      id: workflows.id,
      userId: workflows.userId,
      nodes: workflows.nodes,
      edges: workflows.edges,
    })
    .from(workflows)
    .where(eq(workflows.id, input.workflowId));
  if (!workflow) {
    throw new Error("The workflow behind this process no longer exists");
  }

  const created = await db.transaction(async (tx) => {
    const newCase = await createCaseInTx(tx, {
      processDefinitionId: input.processDefinitionId,
      title: input.title,
      priority: input.priority,
      initiatorId: input.initiatorId,
      metadata: { ...input.metadata, startValues: input.startValues },
      dueAt: input.dueAt,
    });

    // The run is listed under the workflow's owner, who edits the process
    const [execution] = await tx
      .insert(workflowExecutions)
      .values({
        workflowId: workflow.id,
        userId: workflow.userId,
        status: "running",
        input: input.startValues,
      })
      .returning({ id: workflowExecutions.id });

    const [instance] = await tx
      .insert(processInstances)
      .values({
        definitionId: input.processDefinitionId,
        requesterId: input.requester.id,
        workflowExecutionId: execution.id,
      })
      .returning({ id: processInstances.id });

    await tx.insert(formSubmissions).values({
      instanceId: instance.id,
      submittedById: input.requester.id,
      data: input.startValues,
    });

    const [linked] = await tx
      .update(cases)
      .set({ processInstanceId: instance.id })
      .where(eq(cases.id, newCase.id))
      .returning();

    return { linked, instanceId: instance.id, executionId: execution.id };
  });

  try {
    const run = await start(executeWorkflow, [
      {
        nodes: workflow.nodes as WorkflowNode[],
        edges: workflow.edges as WorkflowEdge[],
        triggerInput: {
          ...input.startValues,
          requester: input.requester,
          caseNumber: created.linked.caseNumber,
          caseTitle: created.linked.title,
        },
        executionId: created.executionId,
        workflowId: workflow.id,
        instanceId: created.instanceId,
      },
    ]);

    await db
      .update(processInstances)
      .set({ runId: run.runId })
      .where(eq(processInstances.id, created.instanceId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start";
    await db.transaction(async (tx) => {
      await tx
        .update(processInstances)
        .set({ status: "failed", updatedAt: new Date(), completedAt: new Date() })
        .where(eq(processInstances.id, created.instanceId));
      await tx
        .update(workflowExecutions)
        .set({ status: "error", error: message, completedAt: new Date() })
        .where(eq(workflowExecutions.id, created.executionId));
      await tx
        .update(cases)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(cases.id, created.linked.id));
    });
    throw error;
  }

  return created.linked;
}
