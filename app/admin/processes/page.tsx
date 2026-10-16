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

type StatusAction = { label: string; status: ProcessStatus };

const STATUS_ACTIONS: Record<ProcessStatus, StatusAction[]> = {
  archived: [{ label: "Restore", status: "draft" }],
  draft: [
    { label: "Publish", status: "published" },
    { label: "Archive", status: "archived" },
  ],
  published: [
    { label: "Unpublish", status: "draft" },
    { label: "Archive", status: "archived" },
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
      toast.error(err instanceof Error ? err.message : "Failed to load");
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
          ? `${process.name} is now published`
          : `${process.name} is now ${status}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
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
          <h1 className="font-semibold text-xl">Processes</h1>
          <div className="flex gap-2">
            {isAdmin ? (
              <Button onClick={() => setDialog({ mode: "create" })} size="sm">
                New process
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href="/">Back to app</Link>
            </Button>
          </div>
        </div>

        {isAdmin ? null : (
          <Card>
            <CardHeader>
              <CardTitle>Admins only</CardTitle>
              <CardDescription>
                Only admins can create and publish processes.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {isAdmin && loaded && processes.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No processes yet</CardTitle>
              <CardDescription>
                Design a workflow in the editor, then publish it here as a
                process people can start, such as a leave request.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {isAdmin && processes.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>All processes</CardTitle>
              <CardDescription>
                Only published processes can be started by members.
              </CardDescription>
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
                        {process.startFormFields.length}{" "}
                        {process.startFormFields.length === 1
                          ? "start field"
                          : "start fields"}
                      </p>
                    </div>
                    <Badge variant={STATUS_BADGE[process.status]}>
                      {process.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/workflows/${process.workflowId}`}>
                        Open in editor
                      </Link>
                    </Button>
                    <Button
                      onClick={() => setDialog({ mode: "edit", process })}
                      size="sm"
                      variant="outline"
                    >
                      Edit start form
                    </Button>
                    {STATUS_ACTIONS[process.status].map((action) => (
                      <Button
                        key={action.status}
                        onClick={() => changeStatus(process, action.status)}
                        size="sm"
                        variant="outline"
                      >
                        {action.label}
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
