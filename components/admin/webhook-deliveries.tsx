"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Bound } from "@/components/ui/bound";
import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api, type WebhookDeliverySummary } from "@/lib/api-client";
import { deliveryStatusLabel } from "@/lib/webhooks/labels";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

// The latest deliveries to one endpoint, with a way to send one again
export function WebhookDeliveries({ webhookId }: { webhookId: string }) {
  const [rows, setRows] = useState<WebhookDeliverySummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    api.webhook
      .deliveries(webhookId)
      .then(setRows)
      .catch((err) =>
        toast.error(
          err instanceof Error ? err.message : m.webhooks_load_failed()
        )
      )
      .finally(() => setLoaded(true));
  }, [webhookId]);

  useEffect(() => {
    load();
  }, [load]);

  const redeliver = useStableCallback(async (deliveryId: string) => {
    try {
      const result = await api.webhook.redeliver(webhookId, deliveryId);
      toast.message(
        m.webhooks_redelivered({
          status: String(result.status ?? result.error ?? "-"),
        })
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.webhooks_load_failed()
      );
    }
    load();
  });

  if (loaded && rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {m.webhooks_deliveries_empty()}
      </p>
    );
  }

  return (
    <div
      className="divide-y rounded-md border"
      data-testid="webhook-deliveries"
    >
      {rows.map((row) => (
        <div
          className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
          data-testid="webhook-delivery"
          key={row.id}
        >
          <div className="min-w-0">
            <p className="font-medium">{row.eventType}</p>
            <p className="text-muted-foreground text-xs">
              {new Date(row.createdAt).toLocaleString(getLocale())} ·{" "}
              {m.webhooks_attempts({ count: row.attempts })}
              {row.lastStatusCode ? ` · ${row.lastStatusCode}` : ""}
              {row.lastError ? ` · ${row.lastError}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={row.status === "succeeded" ? "default" : "secondary"}
            >
              {deliveryStatusLabel(row.status)}
            </Badge>
            <Bound args={[row.id]} fn={redeliver}>
              {(onClick) => (
                <Button onClick={onClick} size="sm" variant="outline">
                  {m.webhooks_redeliver()}
                </Button>
              )}
            </Bound>
          </div>
        </div>
      ))}
    </div>
  );
}
