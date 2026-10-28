"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Bound } from "@/components/ui/bound";
import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/hooks/use-stable-callback";
import {
  api,
  type WebhookDeliveryDetail,
  type WebhookDeliverySummary,
} from "@/lib/api-client";
import { deliveryStatusLabel } from "@/lib/webhooks/labels";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

// The payload that was sent and what each try got back
function DeliveryDetail({ detail }: { detail: WebhookDeliveryDetail }) {
  return (
    <div className="space-y-3 text-xs" data-testid="webhook-delivery-detail">
      <div>
        <p className="mb-1 font-medium">{m.webhooks_delivery_history()}</p>
        {detail.attempts.length === 0 ? (
          <p className="text-muted-foreground">{m.webhooks_delivery_none()}</p>
        ) : (
          <ul className="space-y-1">
            {detail.attempts.map((attempt) => (
              <li data-testid="webhook-attempt" key={attempt.id}>
                #{attempt.attempt} ·{" "}
                {new Date(attempt.createdAt).toLocaleString(getLocale())} ·{" "}
                {attempt.statusCode ?? m.webhooks_delivery_noresp()} ·{" "}
                {m.webhooks_delivery_ms({ ms: attempt.durationMs })}
                {attempt.error ? ` · ${attempt.error}` : ""}
                {attempt.response ? (
                  <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted p-2">
                    {attempt.response}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-1 font-medium">{m.webhooks_delivery_payload()}</p>
        <pre className="max-h-64 overflow-auto rounded bg-muted p-2">
          {JSON.stringify(detail.delivery.payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// The latest deliveries to one endpoint, with a way to send one again
export function WebhookDeliveries({ webhookId }: { webhookId: string }) {
  const [rows, setRows] = useState<WebhookDeliverySummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WebhookDeliveryDetail | null>(null);

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

  const toggle = useStableCallback(async (deliveryId: string) => {
    if (openId === deliveryId) {
      setOpenId(null);
      return;
    }
    setOpenId(deliveryId);
    setDetail(null);
    try {
      setDetail(await api.webhook.delivery(webhookId, deliveryId));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.webhooks_load_failed()
      );
    }
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
          className="p-3 text-sm"
          data-testid="webhook-delivery"
          key={row.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
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
              <Bound args={[row.id]} fn={toggle}>
                {(onClick) => (
                  <Button
                    data-testid="webhook-delivery-toggle"
                    onClick={onClick}
                    size="sm"
                    variant="ghost"
                  >
                    {openId === row.id
                      ? m.webhooks_delivery_hide()
                      : m.webhooks_delivery_details()}
                  </Button>
                )}
              </Bound>
              <Bound args={[row.id]} fn={redeliver}>
                {(onClick) => (
                  <Button onClick={onClick} size="sm" variant="outline">
                    {m.webhooks_redeliver()}
                  </Button>
                )}
              </Bound>
            </div>
          </div>
          {openId === row.id && detail ? (
            <div className="mt-3">
              <DeliveryDetail detail={detail} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
