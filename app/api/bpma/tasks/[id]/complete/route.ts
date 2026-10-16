import { NextResponse } from "next/server";
import { resumeHook } from "workflow/api";
import { readJsonObject } from "@/lib/api/read-json";
import {
  canActOnTask,
  completeTask,
  getDepartmentIdOf,
  getTask,
  reopenTask,
} from "@/lib/db/bpma";
import { taskToken } from "@/lib/process-branches";
import { validateFormValues } from "@/lib/process-form-validation";
import { requireUser } from "@/lib/session";
import type { HumanTaskDecision } from "@/lib/types/human-task";
import type { FormField } from "@/lib/types/process-form";

type Params = { params: Promise<{ id: string }> };

const MAX_OUTCOME_LENGTH = 100;

// POST /api/bpma/tasks/:id/complete
// Body: { outcome?: string, values?: { [fieldKey]: value } }
export async function POST(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const task = await getTask(id);
  if (
    !(
      task &&
      canActOnTask(guard.user, task, await getDepartmentIdOf(guard.user.id))
    )
  ) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  let outcome: string | null = null;
  if (body.outcome !== undefined && body.outcome !== null) {
    if (
      typeof body.outcome !== "string" ||
      !body.outcome.trim() ||
      body.outcome.length > MAX_OUTCOME_LENGTH
    ) {
      return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
    }
    outcome = body.outcome.trim();
  }

  if (task.outcomes.length > 0) {
    const allowed = task.outcomes.map((item) => item.id);
    if (!(outcome && allowed.includes(outcome))) {
      return NextResponse.json(
        { error: `Choose an outcome: ${allowed.join(", ")}` },
        { status: 400 }
      );
    }
  }

  const validated = validateFormValues(
    task.formFields as FormField[],
    body.values ?? {}
  );
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await completeTask({
    completedById: guard.user.id,
    outcome,
    task,
    values: validated.values,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Task is already completed or cancelled" },
      { status: 409 }
    );
  }

  // Let the waiting process continue. If it cannot be reached, put the task
  // back so it is not finished while the process still waits for it.
  const decision: HumanTaskDecision = {
    by: guard.user.id,
    outcome: outcome ?? "",
    values: validated.values,
  };
  try {
    await resumeHook(taskToken(task.instanceId, task.nodeId), decision);
  } catch (error) {
    console.error("[tasks] failed to resume process:", error);
    await reopenTask(task);
    return NextResponse.json(
      { error: "The process could not be resumed. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json(result.task);
}
