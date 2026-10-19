"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api, type TaskRecord } from "@/lib/api-client";
import type { TaskStatus } from "@/lib/db/schema";
import { isOverdue } from "@/lib/overdue";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

function TaskRow({ task }: { task: TaskRecord }) {
  const mine = task.assigneeId !== null;
  return (
    <Link
      className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50"
      data-testid="task-row"
      href={`/tasks/${task.id}`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{task.name}</p>
        <p className="truncate text-muted-foreground text-xs">
          {task.caseNumber ? `${task.caseNumber} · ` : ""}
          {task.caseTitle ?? ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isOverdue(task) ? (
          <Badge data-testid="task-overdue" variant="destructive">
            {m.tasks_overdue()}
          </Badge>
        ) : null}
        {task.status === "pending" && task.dueAt ? (
          <span className="text-muted-foreground text-xs">
            {m.tasks_due({
              date: new Date(task.dueAt).toLocaleDateString(getLocale()),
            })}
          </span>
        ) : null}
        <Badge variant="outline">
          {mine ? m.tasks_assigned_to_you() : m.tasks_team_pool()}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {new Date(task.createdAt).toLocaleDateString(getLocale())}
        </span>
      </div>
    </Link>
  );
}

export default function TasksPage() {
  const [status, setStatus] = useState<TaskStatus>("pending");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const handleStatusChange = useStableCallback((next: string) => {
    setLoaded(false);
    setStatus(next as TaskStatus);
  });

  useEffect(() => {
    api.task
      .list(status)
      .then(setTasks)
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : m.load_failed())
      )
      .finally(() => setLoaded(true));
  }, [status]);

  return (
    <>
      <PageHeader title={m.nav_my_tasks()} />
      <Tabs onValueChange={handleStatusChange} value={status}>
        <TabsList>
          <TabsTrigger value="pending">{m.tasks_tab_pending()}</TabsTrigger>
          <TabsTrigger value="completed">{m.tasks_tab_completed()}</TabsTrigger>
        </TabsList>
      </Tabs>
      {loaded && tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {status === "pending"
            ? m.tasks_empty_pending()
            : m.tasks_empty_done()}
        </p>
      ) : null}
      <div className="divide-y">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </>
  );
}
