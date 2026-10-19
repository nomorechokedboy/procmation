import type { DueUnit } from "@/lib/types/human-task";

const MS_PER_HOUR = 3_600_000;
const HOURS_PER_DAY = 24;
const DEFAULT_GRACE_HOURS = 24;

export const DUE_UNITS: DueUnit[] = ["hours", "days"];

// The deadline a task gets when it opens, or null when no deadline is set
export function computeDueAt(
  amount: unknown,
  unit: unknown,
  from: Date
): Date | null {
  const value = typeof amount === "string" ? Number(amount.trim()) : amount;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const hours = unit === "days" ? value * HOURS_PER_DAY : value;
  return new Date(from.getTime() + hours * MS_PER_HOUR);
}

// How long after the deadline the assignee's manager is told. Set
// ESCALATION_GRACE_HOURS to change it.
export function escalationGraceMs(): number {
  const configured = Number(process.env.ESCALATION_GRACE_HOURS);
  const hours =
    Number.isFinite(configured) &&
    configured >= 0 &&
    process.env.ESCALATION_GRACE_HOURS
      ? configured
      : DEFAULT_GRACE_HOURS;
  return hours * MS_PER_HOUR;
}
