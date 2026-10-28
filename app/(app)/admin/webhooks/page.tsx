"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { WebhookDeliveries } from "@/components/admin/webhook-deliveries";
import { WebhookDialog } from "@/components/admin/webhook-dialog";
import { WebhookSecretDialog } from "@/components/admin/webhook-secret-dialog";
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
import { api, type WebhookEndpointSummary } from "@/lib/api-client";
import type { WebhookEventType } from "@/lib/webhooks/events";
import {
  deliveryStatusLabel,
  WEBHOOK_EVENT_LABELS,
} from "@/lib/webhooks/labels";
import * as m from "@/paraglide/messages";

type CardActions = {
  onEdit: (webhook: WebhookEndpointSummary) => void;
  onToggle: (webhook: WebhookEndpointSummary) => void;
  onTest: (webhook: WebhookEndpointSummary) => void;
  onRotate: (webhook: WebhookEndpointSummary) => void;
  onDelete: (webhook: WebhookEndpointSummary) => void;
};

function eventNames(events: string[]): string {
  return events
    .map(
      (event) => WEBHOOK_EVENT_LABELS[event as WebhookEventType]?.() ?? event
    )
    .join(", ");
}

function WebhookCard({
  webhook,
  actions,
}: {
  webhook: WebhookEndpointSummary;
  actions: CardActions;
}) {
  const [showLog, setShowLog] = useState(false);
  const toggleLog = useStableCallback(() => setShowLog((open) => !open));
  const buttons: [string, (item: WebhookEndpointSummary) => void, string][] = [
    [m.webhooks_edit(), actions.onEdit, "webhook-edit"],
    [
      webhook.enabled ? m.webhooks_turn_off() : m.webhooks_turn_on(),
      actions.onToggle,
      "webhook-toggle",
    ],
    [m.webhooks_test(), actions.onTest, "webhook-test"],
    [m.webhooks_rotate(), actions.onRotate, "webhook-rotate"],
    [m.webhooks_delete(), actions.onDelete, "webhook-delete"],
  ];

  return (
    <Card data-testid="webhook-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{webhook.name}</CardTitle>
          <div className="flex items-center gap-2">
            {webhook.lastDeliveryStatus ? (
              <span className="text-muted-foreground text-xs">
                {m.webhooks_last_delivery({
                  status: deliveryStatusLabel(webhook.lastDeliveryStatus),
                })}
              </span>
            ) : null}
            <Badge
              data-testid="webhook-state"
              variant={webhook.enabled ? "default" : "secondary"}
            >
              {webhook.enabled ? m.webhooks_enabled() : m.webhooks_disabled()}
            </Badge>
          </div>
        </div>
        <p className="break-all text-muted-foreground text-xs">{webhook.url}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{eventNames(webhook.events)}</p>
        {webhook.disabledReason ? (
          <p className="text-destructive text-sm">{webhook.disabledReason}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {buttons.map(([label, handler, testId]) => (
            <Bound args={[webhook]} fn={handler} key={testId}>
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
          <Button
            data-testid="webhook-log"
            onClick={toggleLog}
            size="sm"
            variant="ghost"
          >
            {m.webhooks_deliveries()}
          </Button>
        </div>
        {showLog ? <WebhookDeliveries webhookId={webhook.id} /> : null}
      </CardContent>
    </Card>
  );
}

export default function WebhooksPage() {
  const { can, loaded: permsLoaded } = usePermissions();
  const allowed = can("integrations.manage");
  const [webhooks, setWebhooks] = useState<WebhookEndpointSummary[]>([]);
  const [fetched, setFetched] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpointSummary | "new" | null>(
    null
  );
  const [secret, setSecret] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WebhookEndpointSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setWebhooks(await api.webhook.list());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.webhooks_load_failed()
      );
    } finally {
      setFetched(true);
    }
  }, []);

  useEffect(() => {
    if (allowed) {
      load();
    }
  }, [allowed, load]);

  const onSaved = useStableCallback(async (newSecret?: string) => {
    if (newSecret) {
      setSecret(newSecret);
    }
    await load();
  });
  const toggle = useStableCallback(async (webhook: WebhookEndpointSummary) => {
    try {
      await api.webhook.update(webhook.id, { enabled: !webhook.enabled });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.webhooks_save_failed()
      );
    }
    await load();
  });
  const test = useStableCallback(async (webhook: WebhookEndpointSummary) => {
    try {
      const result = await api.webhook.test(webhook.id);
      if (result.ok) {
        toast.success(m.webhooks_test_ok({ status: String(result.status) }));
      } else {
        toast.error(m.webhooks_test_failed({ error: result.error ?? "-" }));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.webhooks_load_failed()
      );
    }
    await load();
  });
  const rotate = useStableCallback(async (webhook: WebhookEndpointSummary) => {
    try {
      const updated = await api.webhook.update(webhook.id, {
        rotateSecret: true,
      });
      setSecret(updated.secret ?? null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.webhooks_save_failed()
      );
    }
  });
  const confirmDelete = useStableCallback(async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.webhook.delete(deleting.id);
      toast.success(m.webhooks_deleted());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.webhooks_save_failed()
      );
    }
    setDeleting(null);
    await load();
  });
  const openNew = useStableCallback(() => setEditing("new"));
  const closeDialog = useStableCallback(() => setEditing(null));
  const closeSecret = useStableCallback(() => setSecret(null));
  const handleDeleteOpen = useStableCallback((open: boolean) => {
    if (!open) {
      setDeleting(null);
    }
  });

  if (!(permsLoaded && allowed)) {
    return null;
  }

  const actions: CardActions = {
    onDelete: setDeleting,
    onEdit: setEditing,
    onRotate: rotate,
    onTest: test,
    onToggle: toggle,
  };

  return (
    <>
      <PageHeader
        actions={
          <Button data-testid="webhook-new" onClick={openNew} size="sm">
            <Plus className="size-4" />
            {m.webhooks_new()}
          </Button>
        }
        title={m.webhooks_title()}
      />
      <p className="text-muted-foreground text-sm">{m.webhooks_intro()}</p>
      {fetched && webhooks.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.webhooks_empty()}</p>
      ) : null}
      <div className="space-y-3">
        {webhooks.map((webhook) => (
          <WebhookCard actions={actions} key={webhook.id} webhook={webhook} />
        ))}
      </div>
      {editing ? (
        <WebhookDialog
          onClose={closeDialog}
          onSaved={onSaved}
          webhook={editing === "new" ? undefined : editing}
        />
      ) : null}
      {secret ? (
        <WebhookSecretDialog onClose={closeSecret} secret={secret} />
      ) : null}
      <AlertDialog onOpenChange={handleDeleteOpen} open={deleting !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.webhooks_delete()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.webhooks_delete_confirm({ name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <Button
              data-testid="webhook-delete-confirm"
              onClick={confirmDelete}
              variant="destructive"
            >
              {m.webhooks_delete()}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
