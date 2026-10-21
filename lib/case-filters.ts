import type { CaseFilters } from "@/lib/db/bpma";
import { CASE_PRIORITIES, CASE_STATUSES } from "@/lib/db/case-options";
import type { CasePriority, CaseStatus } from "@/lib/db/schema";

const MAX_SEARCH_LENGTH = 100;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Parsed = { ok: true; filters: CaseFilters } | { ok: false; error: string };

function parseDay(value: string | null): Date | null | "invalid" {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return DAY_PATTERN.test(value) && !Number.isNaN(date.getTime())
    ? date
    : "invalid";
}

// The filters a case list accepts as query parameters: status, priority,
// processId, q (search), from and to (YYYY-MM-DD), overdue
export function parseCaseFilters(params: URLSearchParams): Parsed {
  const status = params.get("status");
  const priority = params.get("priority");
  if (status && !CASE_STATUSES.includes(status as CaseStatus)) {
    return { error: "Unknown status", ok: false };
  }
  if (priority && !CASE_PRIORITIES.includes(priority as CasePriority)) {
    return { error: "Unknown priority", ok: false };
  }

  const from = parseDay(params.get("from"));
  const to = parseDay(params.get("to"));
  if (from === "invalid" || to === "invalid") {
    return { error: "Dates look like 2026-03-31", ok: false };
  }

  const q = params.get("q")?.trim().slice(0, MAX_SEARCH_LENGTH);
  return {
    filters: {
      from: from ?? undefined,
      overdue: params.get("overdue") === "true",
      priority: (priority as CasePriority | null) ?? undefined,
      processDefinitionId: params.get("processId") ?? undefined,
      q: q || undefined,
      status: (status as CaseStatus | null) ?? undefined,
      to: to ?? undefined,
    },
    ok: true,
  };
}
