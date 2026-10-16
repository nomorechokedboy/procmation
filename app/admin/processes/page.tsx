"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ProcessDialog } from "@/components/process/process-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  api,
  type ProcessStatus,
  type ProcessSummary,
  type SavedWorkflow,
} from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";

type StatusActionId = "restore" | "publish" | "archive" | "unpublish";

type StatusAction = { id: StatusActionId; status: ProcessStatus };

function actionLabel(id: StatusActionId): string {
  switch (id) {
    case "restore":
      return m.processes_action_restore();
    case "publish":
      return m.processes_action_publish();
    case "archive":
      return m.processes_action_archive();
    default:
      return m.processes_action_unpublish();
  }
}

function statusLabel(status: ProcessStatus): string {
  switch (status) {
    case "draft":
      return m.processes_status_draft();
    case "published":
      return m.processes_status_published();
    default:
      return m.processes_status_archived();
  }
}

const STATUS_ACTIONS: Record<ProcessStatus, StatusAction[]> = {
  archived: [{ id: "restore", status: "draft" }],
  draft: [
    { id: "publish", status: "published" },
    { id: "archive", status: "archived" },
  ],
  published: [
    { id: "unpublish", status: "draft" },
    { id: "archive", status: "archived" },
  ],
};

const STATUS_BADGE: Record<ProcessStatus, "default" | "secondary" | "outline"> =
  {
    archived: "outline",
    draft: "secondary",
    published: "default",
  };

export default function ProcessesPage() {
  const { data: session, isPending } = useSession();
  const isAdmin = session?.user.role === "admin";

  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; process: ProcessSummary } | null
  >(null);

  const load = useCallback(async () => {
    try {
      const [processList, workflowList] = await Promise.all([
        api.process.list(),
        api.workflow.getAll(),
      ]);
      setProcesses(processList);
      setWorkflows(workflowList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.members_load_failed());
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      load();
    }
  }, [isAdmin, load]);

  const changeStatus = async (
    process: ProcessSummary,
    status: ProcessStatus
  ) => {
    try {
      await api.process.update(process.id, { status });
      toast.success(
        status === "published"
          ? m.processes_now_published({ name: process.name })
          : m.processes_now_status({
              name: process.name,
              status: statusLabel(status),
            })
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.processes_update_failed()
      );
    }
    await load();
  };

  if (isPending) {
    return null;
  }

  const usedWorkflowIds = new Set(
    processes.map((process) => process.workflowId)
  );
  const availableWorkflows = workflows.filter(
    (workflow) => !usedWorkflowIds.has(workflow.id)
  );

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-xl">{m.processes_title()}</h1>
          <div className="flex gap-2">
            {isAdmin ? (
              <Button onClick={() => setDialog({ mode: "create" })} size="sm">
                {m.processes_new()}
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href="/">{m.common_back_to_app()}</Link>
            </Button>
          </div>
        </div>

        {isAdmin ? null : (
          <Card>
            <CardHeader>
              <CardTitle>{m.members_admins_only_title()}</CardTitle>
              <CardDescription>
                {m.processes_admins_only_description()}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {isAdmin && loaded && processes.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{m.processes_empty_title()}</CardTitle>
              <CardDescription>
                {m.processes_empty_description()}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {isAdmin && processes.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{m.processes_all_title()}</CardTitle>
              <CardDescription>{m.processes_all_description()}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {processes.map((process) => (
                <div className="space-y-3 py-4" key={process.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {process.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {process.category ? `${process.category}, ` : ""}
                        {process.startFormFields.length === 1
                          ? m.processes_start_fields_one({ count: 1 })
                          : m.processes_start_fields_other({
                              count: process.startFormFields.length,
                            })}
                      </p>
                    </div>
                    <Badge variant={STATUS_BADGE[process.status]}>
                      {statusLabel(process.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/workflows/${process.workflowId}`}>
                        {m.processes_open_editor()}
                      </Link>
                    </Button>
                    <Button
                      onClick={() => setDialog({ mode: "edit", process })}
                      size="sm"
                      variant="outline"
                    >
                      {m.processes_edit_start_form()}
                    </Button>
                    {STATUS_ACTIONS[process.status].map((action) => (
                      <Button
                        key={action.id}
                        onClick={() => changeStatus(process, action.status)}
                        size="sm"
                        variant="outline"
                      >
                        {actionLabel(action.id)}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {dialog?.mode === "create" ? (
          <ProcessDialog
            mode="create"
            onClose={() => setDialog(null)}
            onSaved={load}
            workflows={availableWorkflows}
          />
        ) : null}
        {dialog?.mode === "edit" ? (
          <ProcessDialog
            mode="edit"
            onClose={() => setDialog(null)}
            onSaved={load}
            process={dialog.process}
          />
        ) : null}
      </div>
    </div>
  );
}
