"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { DynamicForm } from "@/components/forms/dynamic-form";
import { Bound } from "@/components/ui/bound";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api, type TaskRecord } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { validateFormValues } from "@/lib/process-form-validation";
import type { FormField, FormValues } from "@/lib/types/process-form";
import * as m from "@/paraglide/messages";

type TaskFormProps = { task: TaskRecord };

// Pool tasks wait for someone in the department to take them
function ClaimBar({
  task,
  onChanged,
}: {
  task: TaskRecord;
  onChanged: (task: TaskRecord) => void;
}) {
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  const inPool = task.assigneeDepartmentId !== null;
  const mine = task.assigneeId !== null && task.assigneeId === session?.user.id;

  const run = useStableCallback(async (action: "claim" | "release") => {
    setBusy(true);
    try {
      const updated =
        action === "claim"
          ? await api.task.claim(task.id)
          : await api.task.release(task.id);
      toast.success(
        action === "claim" ? m.task_claimed_toast() : m.task_released_toast()
      );
      onChanged({ ...task, ...updated });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.task_claim_failed());
    } finally {
      setBusy(false);
    }
  });
  const handleClaim = useStableCallback(() => run("claim"));
  const handleRelease = useStableCallback(() => run("release"));

  if (task.status !== "pending" || !inPool) {
    return null;
  }
  if (task.assigneeId === null) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3">
        <p className="flex-1 text-sm">{m.task_claim_hint()}</p>
        <Button
          data-testid="claim-task"
          disabled={busy}
          onClick={handleClaim}
          size="sm"
        >
          {m.task_claim()}
        </Button>
      </div>
    );
  }
  return mine || session?.user.role === "admin" ? (
    <div>
      <Button
        data-testid="release-task"
        disabled={busy}
        onClick={handleRelease}
        size="sm"
        variant="outline"
      >
        {m.task_release()}
      </Button>
    </div>
  ) : null;
}

function TaskForm({
  task,
  onChanged,
}: TaskFormProps & { onChanged: (task: TaskRecord) => void }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>({});
  const [submitting, setSubmitting] = useState(false);
  const fields = task.formFields as FormField[];
  const done = task.status !== "pending";

  const submit = useStableCallback(async (outcome?: string) => {
    const checked = validateFormValues(fields, values);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }
    setSubmitting(true);
    try {
      await api.task.complete(task.id, {
        outcome,
        values: checked.values,
      });
      toast.success(m.task_completed());
      router.push("/tasks");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.task_complete_failed()
      );
      setSubmitting(false);
    }
  });

  const handleComplete = useStableCallback(() => submit());

  return (
    <Card>
      <CardHeader>
        <CardTitle>{task.name}</CardTitle>
        <CardDescription>
          {task.caseNumber ? `${task.caseNumber} · ` : ""}
          {task.caseTitle ?? ""}
          {task.caseId ? (
            <>
              {" · "}
              <Link
                className="underline underline-offset-2"
                href={`/cases/${task.caseId}`}
              >
                {m.task_view_case()}
              </Link>
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ClaimBar onChanged={onChanged} task={task} />
        {done ? (
          <p className="text-muted-foreground text-sm">
            {task.outcome
              ? m.task_done_with_outcome({
                  outcome:
                    task.outcomes.find((item) => item.id === task.outcome)
                      ?.label ?? task.outcome,
                })
              : m.task_done()}
          </p>
        ) : (
          <>
            <DynamicForm
              disabled={submitting}
              fields={fields}
              idPrefix="task"
              onChange={setValues}
              values={values}
            />
            <div className="flex flex-wrap gap-2">
              {task.outcomes.length > 0 ? (
                task.outcomes.map((outcome) => (
                  <Bound args={[outcome.id]} fn={submit} key={outcome.id}>
                    {(onClick) => (
                      <Button
                        data-testid={`outcome-${outcome.id}`}
                        disabled={submitting}
                        onClick={onClick}
                        type="button"
                      >
                        {outcome.label}
                      </Button>
                    )}
                  </Bound>
                ))
              ) : (
                <Button
                  data-testid="complete-task"
                  disabled={submitting}
                  onClick={handleComplete}
                  type="button"
                >
                  {m.task_complete()}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function TaskPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.task
      .get(taskId)
      .then(setTask)
      .catch(() => setMissing(true));
  }, [taskId]);

  return (
    <>
      <PageHeader title={m.task_title()} />
      {task ? <TaskForm onChanged={setTask} task={task} /> : null}
      {missing ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">{m.task_not_found()}</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/tasks">{m.nav_my_tasks()}</Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}
