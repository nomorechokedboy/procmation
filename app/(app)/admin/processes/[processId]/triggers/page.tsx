"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { TriggerDialog } from "@/components/admin/trigger-dialog";
import { TriggerUrlDialog } from "@/components/admin/trigger-url-dialog";
import { PageHeader } from "@/components/app/page-header";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Bound } from "@/components/ui/bound";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermissions } from "@/hooks/use-permissions";
import { useStableCallback } from "@/hooks/use-stable-callback";
import {
  api,
  type ProcessSummary,
  type ProcessTriggerSummary,
} from "@/lib/api-client";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

type Actions = {
  onEdit: (trigger: ProcessTriggerSummary) => void;
  onToggle: (trigger: ProcessTriggerSummary) => void;
  onRotate: (trigger: ProcessTriggerSummary) => void;
  onDelete: (trigger: ProcessTriggerSummary) => void;
};

function TriggerCard({
  trigger,
  actions,
}: {
  trigger: ProcessTriggerSummary;
  actions: Actions;
}) {
  const buttons: [string, (item: ProcessTriggerSummary) => void, string][] = [
    [m.webhooks_edit(), actions.onEdit, "trigger-edit"],
    [
      trigger.enabled ? m.triggers_turn_off() : m.triggers_turn_on(),
      actions.onToggle,
      "trigger-toggle",
    ],
    [m.triggers_new_url(), actions.onRotate, "trigger-rotate"],
    [m.triggers_delete(), actions.onDelete, "trigger-delete"],
  ];
  return (
    <Card data-testid="trigger-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{trigger.name}</CardTitle>
          <div className="flex items-center gap-2">
            {trigger.signed ? (
              <Badge variant="outline">{m.triggers_signed()}</Badge>
            ) : null}
            <Badge variant={trigger.enabled ? "default" : "secondary"}>
              {trigger.enabled ? m.triggers_enabled() : m.triggers_disabled()}
            </Badge>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          …/api/hooks/{trigger.tokenPrefix}… ·{" "}
          {trigger.lastUsedAt
            ? m.triggers_last_used({
                date: new Date(trigger.lastUsedAt).toLocaleString(getLocale()),
              })
            : m.triggers_never_used()}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {buttons.map(([label, handler, testId]) => (
          <Bound args={[trigger]} fn={handler} key={testId}>
            {(onClick) => (
              <Button
                data-testid={testId}
                onClick={onClick}
                size="sm"
                variant="outline"
              >
                {label}
              </Button>
            )}
          </Bound>
        ))}
      </CardContent>
    </Card>
  );
}

export default function TriggersPage() {
  const { processId } = useParams<{ processId: string }>();
  const { can, loaded } = usePermissions();
  const allowed = can("integrations.manage");
  const [process, setProcess] = useState<ProcessSummary | null>(null);
  const [triggers, setTriggers] = useState<ProcessTriggerSummary[]>([]);
  const [fetched, setFetched] = useState(false);
  const [editing, setEditing] = useState<ProcessTriggerSummary | "new" | null>(
    null
  );
  const [reveal, setReveal] = useState<{
    url: string;
    secret?: string | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<ProcessTriggerSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [summary, list] = await Promise.all([
        api.process.get(processId),
        api.trigger.list(processId),
      ]);
      setProcess(summary);
      setTriggers(list);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.triggers_load_failed()
      );
    } finally {
      setFetched(true);
    }
  }, [processId]);

  useEffect(() => {
    if (allowed) {
      load();
    }
  }, [allowed, load]);

  const onSaved = useStableCallback(
    async (shown?: { url: string; secret?: string | null }) => {
      if (shown) {
        setReveal(shown);
      }
      await load();
    }
  );
  const toggle = useStableCallback(async (trigger: ProcessTriggerSummary) => {
    try {
      await api.trigger.update(trigger.id, { enabled: !trigger.enabled });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.triggers_save_failed()
      );
    }
    await load();
  });
  const rotate = useStableCallback(async (trigger: ProcessTriggerSummary) => {
    try {
      const updated = await api.trigger.update(trigger.id, {
        rotateToken: true,
      });
      setReveal({ secret: updated.secret, url: updated.url ?? "" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.triggers_save_failed()
      );
    }
  });
  const confirmDelete = useStableCallback(async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.trigger.delete(deleting.id);
      toast.success(m.triggers_deleted());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.triggers_save_failed()
      );
    }
    setDeleting(null);
    await load();
  });
  const openNew = useStableCallback(() => setEditing("new"));
  const closeDialog = useStableCallback(() => setEditing(null));
  const closeReveal = useStableCallback(() => setReveal(null));
  const handleDeleteOpen = useStableCallback((open: boolean) => {
    if (!open) {
      setDeleting(null);
    }
  });

  if (!(loaded && allowed)) {
    return null;
  }
  const actions: Actions = {
    onDelete: setDeleting,
    onEdit: setEditing,
    onRotate: rotate,
    onToggle: toggle,
  };

  return (
    <>
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/processes">{m.triggers_back()}</Link>
            </Button>
            <Button data-testid="trigger-new" onClick={openNew} size="sm">
              <Plus className="size-4" />
              {m.triggers_new()}
            </Button>
          </div>
        }
        title={`${m.triggers_title()}${process ? `: ${process.name}` : ""}`}
      />
      <p className="text-muted-foreground text-sm">{m.triggers_intro()}</p>
      {fetched && triggers.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.triggers_empty()}</p>
      ) : null}
      <div className="space-y-3">
        {triggers.map((trigger) => (
          <TriggerCard actions={actions} key={trigger.id} trigger={trigger} />
        ))}
      </div>
      {editing && process ? (
        <TriggerDialog
          fields={process.startFormFields}
          onClose={closeDialog}
          onSaved={onSaved}
          processId={processId}
          trigger={editing === "new" ? undefined : editing}
        />
      ) : null}
      {reveal ? (
        <TriggerUrlDialog
          onClose={closeReveal}
          secret={reveal.secret}
          url={reveal.url}
        />
      ) : null}
      <AlertDialog onOpenChange={handleDeleteOpen} open={deleting !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.triggers_delete()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.triggers_delete_confirm({ name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <Button
              data-testid="trigger-delete-confirm"
              onClick={confirmDelete}
              variant="destructive"
            >
              {m.triggers_delete()}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
