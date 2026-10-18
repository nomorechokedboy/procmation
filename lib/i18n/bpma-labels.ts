import type { CasePriority, CaseStatus } from "@/lib/db/schema";
import * as m from "@/paraglide/messages";
import type { Locale } from "@/paraglide/runtime";

export function caseStatusLabel(status: CaseStatus, locale?: Locale): string {
  const options = { locale };
  switch (status) {
    case "open":
      return m.case_status_open({}, options);
    case "in_progress":
      return m.case_status_in_progress({}, options);
    case "pending_approval":
      return m.case_status_pending_approval({}, options);
    case "approved":
      return m.case_status_approved({}, options);
    case "rejected":
      return m.case_status_rejected({}, options);
    case "completed":
      return m.case_status_completed({}, options);
    case "failed":
      return m.case_status_failed({}, options);
    default:
      return m.case_status_cancelled({}, options);
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
