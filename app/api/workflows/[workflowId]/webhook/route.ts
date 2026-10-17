import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { validateWorkflowIntegrations } from "@/lib/db/integrations";
import { apiKeys, workflowExecutions, workflows } from "@/lib/db/schema";
import { executeWorkflow } from "@/lib/workflow-executor.workflow";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow-store";

// Validate API key and return the user ID if valid
async function validateApiKey(
  authHeader: string | null,
  workflowUserId: string
): Promise<{ valid: boolean; error?: string; statusCode?: number }> {
  if (!authHeader) {
    return {
      error: "Missing Authorization header",
      statusCode: 401,
      valid: false,
    };
  }

  // Support "Bearer <key>" format
  const key = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!key?.startsWith("wfb_")) {
    return { error: "Invalid API key format", statusCode: 401, valid: false };
  }

  // Hash the key to compare with stored hash
  const keyHash = createHash("sha256").update(key).digest("hex");

  // Find the API key in the database
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, keyHash),
  });

  if (!apiKey) {
    return { error: "Invalid API key", statusCode: 401, valid: false };
  }

  // Verify the API key belongs to the workflow owner
  if (apiKey.userId !== workflowUserId) {
    return {
      error: "You do not have permission to run this workflow",
      statusCode: 403,
      valid: false,
    };
  }

  // Update last used timestamp (don't await, fire and forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .catch(() => {
      // Fire and forget - ignore errors
    });

  return { valid: true };
}

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

async function executeWorkflowBackground(
  executionId: string,
  workflowId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  input: Record<string, unknown>
) {
  try {
    console.log("[Webhook] Starting execution:", executionId);

    console.log("[Webhook] Calling executeWorkflow with:", {
      edgeCount: edges.length,
      hasExecutionId: !!executionId,
      nodeCount: nodes.length,
      workflowId,
    });

    start(executeWorkflow, [
      {
        edges,
        executionId,
        nodes,
        triggerInput: input,
        workflowId,
      },
    ]);

    console.log("[Webhook] Workflow started successfully");
  } catch (error) {
    console.error("[Webhook] Error during execution:", error);
    console.error(
      "[Webhook] Error stack:",
      error instanceof Error ? error.stack : "N/A"
    );

    await db
      .update(workflowExecutions)
      .set({
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      })
      .where(eq(workflowExecutions.id, executionId));
  }
}

export function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await context.params;

    // Get workflow
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, workflowId),
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { headers: corsHeaders, status: 404 }
      );
    }

    // Validate API key - must belong to the workflow owner
    const authHeader = request.headers.get("Authorization");
    const apiKeyValidation = await validateApiKey(authHeader, workflow.userId);

    if (!apiKeyValidation.valid) {
      return NextResponse.json(
        { error: apiKeyValidation.error },
        { headers: corsHeaders, status: apiKeyValidation.statusCode || 401 }
      );
    }

    // Verify this is a webhook-triggered workflow
    const triggerNode = (workflow.nodes as WorkflowNode[]).find(
      (node) => node.data.type === "trigger"
    );

    if (triggerNode?.data.config?.triggerType !== "Webhook") {
      return NextResponse.json(
        { error: "This workflow is not configured for webhook triggers" },
        { headers: corsHeaders, status: 400 }
      );
    }

    // Validate that all integrationIds in workflow nodes belong to the workflow owner
    const validation = await validateWorkflowIntegrations(
      workflow.nodes as WorkflowNode[],
      workflow.userId
    );
    if (!validation.valid) {
      console.error(
        "[Webhook] Invalid integration references:",
        validation.invalidIds
      );
      return NextResponse.json(
        { error: "Workflow contains invalid integration references" },
        { headers: corsHeaders, status: 403 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));

    // Create execution record
    const [execution] = await db
      .insert(workflowExecutions)
      .values({
        input: body,
        status: "running",
        userId: workflow.userId,
        workflowId,
      })
      .returning();

    console.log("[Webhook] Created execution:", execution.id);

    // Execute the workflow in the background (don't await)
    executeWorkflowBackground(
      execution.id,
      workflowId,
      workflow.nodes as WorkflowNode[],
      workflow.edges as WorkflowEdge[],
      body
    );

    // Return immediately with the execution ID
    return NextResponse.json(
      {
        executionId: execution.id,
        status: "running",
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Webhook] Failed to start workflow execution:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to execute workflow",
      },
      { headers: corsHeaders, status: 500 }
    );
  }
}
