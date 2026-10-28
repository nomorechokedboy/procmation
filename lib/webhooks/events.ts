import type { CaseStatus } from "@/lib/db/schema";

// Events an endpoint can subscribe to
export const WEBHOOK_EVENTS = [
  "case.created",
  "case.completed",
  "case.rejected",
  "case.failed",
  "case.cancelled",
  "task.created",
  "task.completed",
  "task.overdue",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: unknown): value is WebhookEventType {
  return (WEBHOOK_EVENTS as readonly unknown[]).includes(value);
}

// The event for a case that reached a final status; other statuses have none
export function eventForCaseStatus(
  status: CaseStatus
): WebhookEventType | null {
  switch (status) {
    case "completed":
    case "approved":
      return "case.completed";
    case "rejected":
      return "case.rejected";
    case "failed":
      return "case.failed";
    case "cancelled":
      return "case.cancelled";
    default:
      return null;
  }
}

export const EVENT_SUMMARIES: Record<WebhookEventType, string> = {
  "case.cancelled": "was cancelled",
  "case.completed": "was completed",
  "case.created": "was started",
  "case.failed": "failed",
  "case.rejected": "was rejected",
  "task.completed": "has a completed task",
  "task.created": "has a new task",
  "task.overdue": "has an overdue task",
};
