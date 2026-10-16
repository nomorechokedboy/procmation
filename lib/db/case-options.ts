import type { CasePriority, CaseStatus } from "./schema";

export const CASE_STATUSES: CaseStatus[] = [
  "open",
  "in_progress",
  "pending_approval",
  "approved",
  "rejected",
  "completed",
  "cancelled",
];

export const CASE_PRIORITIES: CasePriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

export const MAX_CASE_TITLE_LENGTH = 200;
