import type { CasePriority, CaseStatus } from "./schema";

export const CASE_STATUSES: CaseStatus[] = [
  "open",
  "in_progress",
  "pending_approval",
  "approved",
  "rejected",
  "completed",
  "failed",
  "cancelled",
];

export const CASE_PRIORITIES: CasePriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

export const MAX_CASE_TITLE_LENGTH = 200;

// Statuses of a case that is still running, so it can be cancelled
export const CASE_ACTIVE_STATUSES: CaseStatus[] = [
  "open",
  "in_progress",
  "pending_approval",
];
