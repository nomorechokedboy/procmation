// A date range is stored as one text value, "YYYY-MM-DD/YYYY-MM-DD" (the start
// and the last day, both included), so it fits next to every other field value.
const RANGE_PATTERN = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/;

export type DateRangeParts = { from: string; to: string };

export function parseDateRange(value: unknown): DateRangeParts | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = RANGE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [, from, to] = match;
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return null;
  }
  return from <= to ? { from, to } : null;
}

export function joinDateRange(from: string, to: string): string {
  return `${from}/${to}`;
}

// Calendar days work in local time; stored days are plain dates
export function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromIsoDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function formatDateRange(value: unknown, locale: string): string | null {
  const range = parseDateRange(value);
  if (!range) {
    return null;
  }
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const from = format.format(fromIsoDay(range.from));
  const to = format.format(fromIsoDay(range.to));
  return from === to ? from : `${from} – ${to}`;
}
