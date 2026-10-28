import type { WebhookEventType } from "@/lib/webhooks/events";
import * as m from "@/paraglide/messages";

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, () => string> = {
  "case.cancelled": m.webhooks_event_case_cancelled,
  "case.completed": m.webhooks_event_case_completed,
  "case.created": m.webhooks_event_case_created,
  "case.failed": m.webhooks_event_case_failed,
  "case.rejected": m.webhooks_event_case_rejected,
  "task.completed": m.webhooks_event_task_completed,
  "task.created": m.webhooks_event_task_created,
  "task.overdue": m.webhooks_event_task_overdue,
};

export function deliveryStatusLabel(status: string): string {
  switch (status) {
    case "succeeded":
      return m.webhooks_status_succeeded();
    case "pending":
      return m.webhooks_status_pending();
    default:
      return m.webhooks_status_failed();
  }
}
