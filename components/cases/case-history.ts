import type { CaseDetail } from "@/lib/api-client";
import type { CaseStatus } from "@/lib/db/schema";
import { caseStatusLabel } from "@/lib/i18n/bpma-labels";
import type { FormField } from "@/lib/types/process-form";
import * as m from "@/paraglide/messages";

type Entry = CaseDetail["timeline"][number];
type Directory = Pick<CaseDetail, "people" | "departments" | "tasks">;

export function personName(directory: Directory, id: unknown): string {
  return typeof id === "string" && directory.people[id]
    ? directory.people[id]
    : m.case_detail_someone();
}

function taskName(directory: Directory, entry: Entry): string {
  const task = directory.tasks.find((item) => item.nodeId === entry.nodeId);
  return task?.name ?? String(entry.data.name ?? "");
}

export function outcomeLabel(
  directory: Directory,
  nodeId: string | null,
  outcome: unknown
): string | null {
  if (typeof outcome !== "string" || !outcome) {
    return null;
  }
  const task = directory.tasks.find((item) => item.nodeId === nodeId);
  return task?.outcomes.find((item) => item.id === outcome)?.label ?? outcome;
}

function assigneeLabel(directory: Directory, entry: Entry): string {
  const { assigneeId, assigneeDepartmentId } = entry.data;
  if (typeof assigneeId === "string") {
    return personName(directory, assigneeId);
  }
  if (typeof assigneeDepartmentId === "string") {
    return (
      directory.departments[assigneeDepartmentId] ?? m.case_detail_a_team()
    );
  }
  return m.case_detail_a_team();
}

function describeStatusChange(directory: Directory, entry: Entry): string {
  const to = entry.data.to as CaseStatus | undefined;
  if (to === "cancelled" && entry.actorId) {
    return m.tl_cancelled({ actor: personName(directory, entry.actorId) });
  }
  return to
    ? m.tl_status_changed({ status: caseStatusLabel(to) })
    : m.tl_other({ event: entry.eventType });
}

function describeTaskCompleted(directory: Directory, entry: Entry): string {
  const actor = personName(directory, entry.actorId);
  const task = taskName(directory, entry);
  const outcome = outcomeLabel(directory, entry.nodeId, entry.data.outcome);
  return outcome
    ? m.tl_task_completed_outcome({ actor, outcome, task })
    : m.tl_task_completed({ actor, task });
}

function describeEscalation(directory: Directory, entry: Entry): string {
  const task = taskName(directory, entry);
  const { escalatedToId } = entry.data;
  return typeof escalatedToId === "string"
    ? m.tl_task_escalated({ task, who: personName(directory, escalatedToId) })
    : m.tl_task_escalated_nobody({ task });
}

// One readable sentence for a timeline entry; unknown kinds fall back to
// their type so nothing silently disappears
export function describeEvent(directory: Directory, entry: Entry): string {
  switch (entry.eventType) {
    case "case_created":
      return m.tl_case_created({ actor: personName(directory, entry.actorId) });
    case "task_created":
      return m.tl_task_created({
        assignee: assigneeLabel(directory, entry),
        task: taskName(directory, entry),
      });
    case "task_completed":
      return describeTaskCompleted(directory, entry);
    case "task_reassigned":
      return m.tl_task_reassigned({
        actor: personName(directory, entry.actorId),
        from: personName(directory, entry.data.from),
        task: taskName(directory, entry),
        to: personName(directory, entry.data.to),
      });
    case "task_delegated":
      return m.tl_task_delegated({
        from: personName(directory, entry.data.from),
        task: taskName(directory, entry),
        to: personName(directory, entry.data.to),
      });
    case "task_claimed":
      return m.tl_task_claimed({
        actor: personName(directory, entry.actorId),
        task: taskName(directory, entry),
      });
    case "task_released":
      return m.tl_task_released({
        actor: personName(directory, entry.actorId),
        task: taskName(directory, entry),
      });
    case "task_escalated":
      return describeEscalation(directory, entry);
    case "status_changed":
      return describeStatusChange(directory, entry);
    case "case_updated":
      return m.tl_case_updated({ actor: personName(directory, entry.actorId) });
    default:
      return m.tl_other({ event: entry.eventType });
  }
}

// The event types worth showing; a completed task already covers its form
export function visibleEntries(entries: Entry[]): Entry[] {
  return entries.filter((entry) => entry.eventType !== "form_submitted");
}

export function formatValue(field: FormField | undefined, value: unknown) {
  if (typeof value === "boolean") {
    return value ? m.common_yes() : m.common_no();
  }
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (field?.type === "select") {
    return (
      field.options?.find((o) => o.value === value)?.label ?? String(value)
    );
  }
  return String(value);
}

export function latestFailure(entries: Entry[]): string | null {
  const failed = entries.find(
    (entry) =>
      entry.eventType === "status_changed" && entry.data.to === "failed"
  );
  const error = failed?.data.error;
  if (typeof error !== "string") {
    return null;
  }
  // Engine errors read "Step ... failed after max retries: Error: <reason>"
  const reason = error.split("Error: ").at(-1) ?? error;
  return reason.trim() || error;
}
