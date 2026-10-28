import { EVENT_SUMMARIES, isWebhookEvent } from "@/lib/webhooks/events";
import type { EventPayload } from "@/lib/webhooks/payload";

export type WebhookFormat = "standard" | "slack";
export const WEBHOOK_FORMATS: WebhookFormat[] = ["standard", "slack"];

type CaseData = {
  number?: string;
  title?: string;
  url?: string;
  process?: { name?: string; version?: number | null };
};
type TaskData = { name?: string };

// The JSON body sent to the endpoint. "slack" is a chat message that Slack,
// Mattermost, Discord (with /slack appended) and Teams-style incoming
// webhooks accept; "standard" is the event itself.
export function bodyFor(format: string, payload: EventPayload): string {
  if (format !== "slack") {
    return JSON.stringify(payload);
  }
  const caseData = (payload.data.case ?? {}) as CaseData;
  const taskData = payload.data.task as TaskData | undefined;
  const what = isWebhookEvent(payload.type)
    ? EVENT_SUMMARIES[payload.type]
    : payload.type;
  const version = caseData.process?.version
    ? ` v${caseData.process.version}`
    : "";
  const lines = [
    `*Case ${caseData.number ?? ""}* ${what}: ${caseData.title ?? ""}`,
    `${caseData.process?.name ?? ""}${version}${
      taskData?.name ? ` · ${taskData.name}` : ""
    }`,
    caseData.url ? `<${caseData.url}|Open case>` : "",
  ];
  return JSON.stringify({
    text:
      payload.type === "ping"
        ? "Procmation webhook test"
        : lines.filter(Boolean).join("\n"),
  });
}
