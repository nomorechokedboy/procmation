import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import {
  canActOnTask,
  completeTask,
  getDepartmentIdOf,
  getTask,
} from "@/lib/db/bpma";
import { validateFormValues } from "@/lib/process-form-validation";
import { requireUser } from "@/lib/session";
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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
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

  const validated = validateFormValues(
    task.formFields as FormField[],
    body.values ?? {}
  );
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await completeTask({
    task,
    completedById: guard.user.id,
    outcome,
    values: validated.values,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Task is already completed or cancelled" },
      { status: 409 }
    );
  }

  return NextResponse.json(result.task);
}
