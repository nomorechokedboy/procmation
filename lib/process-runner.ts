import "server-only";

import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { type AuditEntry, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { createCaseInTx, type NewCaseInput } from "@/lib/db/bpma";
import {
  type Case,
  cases,
  caseTimeline,
  formSubmissions,
  processInstances,
  processVersions,
  workflowExecutions,
  workflows,
} from "@/lib/db/schema";
import { executeWorkflow } from "@/lib/workflow-executor.workflow";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow-store";

export type StartCaseInput = NewCaseInput & {
  workflowId: string;
  // The published version this case runs; its graph is what gets executed
  versionId: string;
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
  const [owner] = await db
    .select({ id: workflows.id, userId: workflows.userId })
    .from(workflows)
    .where(eq(workflows.id, input.workflowId));
  if (!owner) {
    throw new Error("The workflow behind this process no longer exists");
  }
  const [version] = await db
    .select({ edges: processVersions.edges, nodes: processVersions.nodes })
    .from(processVersions)
    .where(eq(processVersions.id, input.versionId));
  if (!version) {
    throw new Error("The version of this process no longer exists");
  }
  const workflow = { ...owner, edges: version.edges, nodes: version.nodes };

  const audits: AuditEntry[] = [];
  const created = await db.transaction(async (tx) => {
    const newCase = await createCaseInTx(
      tx,
      {
        dueAt: input.dueAt,
        initiatorId: input.initiatorId,
        metadata: { ...input.metadata, startValues: input.startValues },
        priority: input.priority,
        processDefinitionId: input.processDefinitionId,
        title: input.title,
      },
      userActor(input.requester),
      audits
    );

    // The run is listed under the workflow's owner, who edits the process
    const [execution] = await tx
      .insert(workflowExecutions)
      .values({
        input: input.startValues,
        status: "running",
        userId: workflow.userId,
        workflowId: workflow.id,
      })
      .returning({ id: workflowExecutions.id });

    const [instance] = await tx
      .insert(processInstances)
      .values({
        definitionId: input.processDefinitionId,
        requesterId: input.requester.id,
        versionId: input.versionId,
        workflowExecutionId: execution.id,
      })
      .returning({ id: processInstances.id });

    await tx.insert(formSubmissions).values({
      data: input.startValues,
      instanceId: instance.id,
      submittedById: input.requester.id,
    });

    const [linked] = await tx
      .update(cases)
      .set({ processInstanceId: instance.id })
      .where(eq(cases.id, newCase.id))
      .returning();

    return { executionId: execution.id, instanceId: instance.id, linked };
  });

  // The case exists now, so its entry can be written
  recordAudit(audits);

  try {
    const run = await start(executeWorkflow, [
      {
        edges: workflow.edges as WorkflowEdge[],
        executionId: created.executionId,
        instanceId: created.instanceId,
        nodes: workflow.nodes as WorkflowNode[],
        triggerInput: {
          ...input.startValues,
          caseNumber: created.linked.caseNumber,
          caseTitle: created.linked.title,
          requester: input.requester,
        },
        workflowId: workflow.id,
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
        .set({
          completedAt: new Date(),
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(processInstances.id, created.instanceId));
      await tx
        .update(workflowExecutions)
        .set({ completedAt: new Date(), error: message, status: "error" })
        .where(eq(workflowExecutions.id, created.executionId));
      await tx
        .update(cases)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(cases.id, created.linked.id));
      await tx.insert(caseTimeline).values({
        caseId: created.linked.id,
        data: { error: message, from: created.linked.status, to: "failed" },
        eventType: "status_changed",
      });
    });
    throw error;
  }

  return created.linked;
}
