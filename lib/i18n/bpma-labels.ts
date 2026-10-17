import type { CasePriority, CaseStatus } from "@/lib/db/schema";
import * as m from "@/paraglide/messages";

export function caseStatusLabel(status: CaseStatus): string {
  switch (status) {
    case "open":
      return m.case_status_open();
    case "in_progress":
      return m.case_status_in_progress();
    case "pending_approval":
      return m.case_status_pending_approval();
    case "approved":
      return m.case_status_approved();
    case "rejected":
      return m.case_status_rejected();
    case "completed":
      return m.case_status_completed();
    default:
      return m.case_status_cancelled();
  }
}

export function casePriorityLabel(priority: CasePriority): string {
  switch (priority) {
    case "low":
      return m.priority_low();
    case "medium":
      return m.priority_medium();
    case "high":
      return m.priority_high();
    default:
      return m.priority_urgent();
  }
}
