import * as m from "@/paraglide/messages";

const HOURS_PER_DAY = 24;
const SHOW_DAYS_FROM_HOURS = 48;
const MINUTES_PER_HOUR = 60;

// 0.5 -> "30 min", 5.5 -> "5.5 h", 72 -> "3 d"
export function formatHours(value: number | null): string {
  if (value === null) {
    return "-";
  }
  if (value < 1) {
    const minutes = Math.round(value * MINUTES_PER_HOUR);
    return minutes < 1
      ? m.reports_under_minute()
      : m.reports_minutes({ n: minutes });
  }
  if (value >= SHOW_DAYS_FROM_HOURS) {
    const days = Math.round((value / HOURS_PER_DAY) * 10) / 10;
    return m.reports_days({ n: days });
  }
  return m.reports_hours({ n: Math.round(value * 10) / 10 });
}

export function formatPercent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

const NEEDS_QUOTES = /[",\n]/;
const QUOTE = /"/g;

function cell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replace(QUOTE, '""')}"` : text;
}

export function toCsv(
  header: string[],
  rows: (string | number | null)[][]
): string {
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
