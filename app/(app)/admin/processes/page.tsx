"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { ProcessDialog } from "@/components/process/process-dialog";
import { InstallTemplateButton } from "@/components/templates/install-template-button";
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

function StatusActionButton({
  action,
  process,
  onChangeStatus,
}: {
  action: StatusAction;
  process: ProcessSummary;
  onChangeStatus: (process: ProcessSummary, status: ProcessStatus) => void;
}) {
  const handleClick = useCallback(
    () => onChangeStatus(process, action.status),
    [onChangeStatus, process, action.status]
  );

  return (
    <Button onClick={handleClick} size="sm" variant="outline">
      {actionLabel(action.id)}
    </Button>
  );
}

function ProcessRow({
  process,
  onEditStartForm,
  onChangeStatus,
}: {
  process: ProcessSummary;
  onEditStartForm: (process: ProcessSummary) => void;
  onChangeStatus: (process: ProcessSummary, status: ProcessStatus) => void;
}) {
  const handleEdit = useCallback(
    () => onEditStartForm(process),
    [onEditStartForm, process]
  );

  return (
    <div className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{process.name}</p>
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
        <Button onClick={handleEdit} size="sm" variant="outline">
          {m.processes_edit_start_form()}
        </Button>
        {STATUS_ACTIONS[process.status].map((action) => (
          <StatusActionButton
            action={action}
            key={action.id}
            onChangeStatus={onChangeStatus}
            process={process}
          />
        ))}
      </div>
    </div>
  );
}

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

  const changeStatus = useCallback(
    async (process: ProcessSummary, status: ProcessStatus) => {
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
    },
    [load]
  );

  const openCreate = useCallback(() => setDialog({ mode: "create" }), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const editStartForm = useCallback(
    (process: ProcessSummary) => setDialog({ mode: "edit", process }),
    []
  );

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
    <>
      <PageHeader
        actions={
          isAdmin ? (
            <Button onClick={openCreate} size="sm">
              {m.processes_new()}
            </Button>
          ) : null
        }
        title={m.processes_title()}
      />
      <div className="space-y-6">
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
            <CardContent className="space-y-2">
              <p className="font-medium text-sm">{m.templates_leave_title()}</p>
              <p className="text-muted-foreground text-sm">
                {m.templates_leave_description()}
              </p>
              <InstallTemplateButton onInstalled={load} />
              <p className="pt-2 font-medium text-sm">
                {m.templates_expense_title()}
              </p>
              <p className="text-muted-foreground text-sm">
                {m.templates_expense_description()}
              </p>
              <InstallTemplateButton
                onInstalled={load}
                templateId="expense-approval"
              />
            </CardContent>
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
                <ProcessRow
                  key={process.id}
                  onChangeStatus={changeStatus}
                  onEditStartForm={editStartForm}
                  process={process}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}

        {dialog?.mode === "create" ? (
          <ProcessDialog
            mode="create"
            onClose={closeDialog}
            onSaved={load}
            workflows={availableWorkflows}
          />
        ) : null}
        {dialog?.mode === "edit" ? (
          <ProcessDialog
            mode="edit"
            onClose={closeDialog}
            onSaved={load}
            process={dialog.process}
          />
        ) : null}
      </div>
    </>
  );
}
