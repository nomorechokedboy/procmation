import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const REPORT_RANGES = [7, 30, 90] as const;
export const DEFAULT_RANGE_DAYS = 30;

const SECONDS_PER_HOUR = 3600;

export type ReportSummary = {
  rangeDays: number;
  // Right now, regardless of the range
  now: {
    activeCases: number;
    pendingTasks: number;
    overdueTasks: number;
    escalatedTasks: number;
  };
  // Cases started within the range
  started: number;
  approved: number;
  rejected: number;
  completed: number;
  failed: number;
  cancelled: number;
  // Approved out of approved + rejected; null when none were decided
  approvalRate: number | null;
  // Average hours from start to end, for cases that ended in the range
  avgCycleHours: number | null;
  perDay: { day: string; started: number }[];
  byProcess: ProcessRow[];
  bySteps: StepRow[];
  byPerson: PersonRow[];
};

export type ProcessRow = {
  processId: string;
  name: string;
  started: number;
  approved: number;
  rejected: number;
  active: number;
  avgCycleHours: number | null;
};

export type StepRow = {
  name: string;
  process: string;
  completed: number;
  avgHours: number | null;
};

export type PersonRow = {
  userId: string;
  name: string;
  pending: number;
  overdue: number;
  completed: number;
  avgHours: number | null;
};

type Row = Record<string, unknown>;

// Dates go to the database as UTC text; the columns hold UTC wall-clock time
function asTimestamp(date: Date) {
  return sql`${date.toISOString()}::timestamp`;
}

const num = (value: unknown): number => Number(value ?? 0);
const hours = (value: unknown): number | null =>
  value === null || value === undefined
    ? null
    : Math.round((Number(value) / SECONDS_PER_HOUR) * 100) / 100;

export function parseRange(value: string | null | undefined): number {
  const days = Number(value);
  return (REPORT_RANGES as readonly number[]).includes(days)
    ? days
    : DEFAULT_RANGE_DAYS;
}

async function currentLoad(): Promise<ReportSummary["now"]> {
  const [row] = await db.execute<Row>(sql`
    select
      (select count(*) from cases
        where status in ('open', 'in_progress', 'pending_approval')) as active,
      (select count(*) from tasks where status = 'pending') as pending,
      (select count(*) from tasks
        where status = 'pending' and due_at is not null and due_at < now()) as overdue,
      (select count(*) from tasks
        where status = 'pending' and escalated_at is not null) as escalated
  `);
  return {
    activeCases: num(row?.active),
    escalatedTasks: num(row?.escalated),
    overdueTasks: num(row?.overdue),
    pendingTasks: num(row?.pending),
  };
}

async function statusCounts(since: Date) {
  const rows = await db.execute<Row>(sql`
    select status, count(*) as n from cases
    where created_at >= ${asTimestamp(since)} group by status
  `);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[String(row.status)] = num(row.n);
  }
  return counts;
}

async function cycleTime(since: Date): Promise<number | null> {
  const [row] = await db.execute<Row>(sql`
    select avg(extract(epoch from completed_at - created_at)) as seconds
    from process_instances
    where status = 'completed' and completed_at >= ${asTimestamp(since)}
  `);
  return hours(row?.seconds);
}

// One row per day of the range, including days with nothing started
async function startedPerDay(since: Date, days: number) {
  const rows = await db.execute<Row>(sql`
    select to_char(d.day, 'YYYY-MM-DD') as day, count(c.id) as n
    from generate_series(
      date_trunc('day', ${asTimestamp(since)}),
      date_trunc('day', now()::timestamp),
      interval '1 day'
    ) as d(day)
    left join cases c on date_trunc('day', c.created_at) = d.day
    group by d.day order by d.day
  `);
  return rows
    .map((row) => ({ day: String(row.day), started: num(row.n) }))
    .slice(-(days + 1));
}

async function perProcess(since: Date): Promise<ProcessRow[]> {
  const rows = await db.execute<Row>(sql`
    select
      p.id as process_id,
      w.name as name,
      count(c.id) filter (where c.created_at >= ${asTimestamp(since)}) as started,
      count(c.id) filter (where c.created_at >= ${asTimestamp(since)} and c.status = 'approved') as approved,
      count(c.id) filter (where c.created_at >= ${asTimestamp(since)} and c.status = 'rejected') as rejected,
      count(c.id) filter (where c.status in ('open', 'in_progress', 'pending_approval')) as active,
      avg(extract(epoch from i.completed_at - i.created_at))
        filter (where i.status = 'completed' and i.completed_at >= ${asTimestamp(since)}) as seconds
    from process_definitions p
    join workflows w on w.id = p.workflow_id
    left join cases c on c.process_definition_id = p.id
    left join process_instances i on i.id = c.process_instance_id
    group by p.id, w.name
    order by started desc, w.name
  `);
  return rows.map((row) => ({
    active: num(row.active),
    approved: num(row.approved),
    avgCycleHours: hours(row.seconds),
    name: String(row.name),
    processId: String(row.process_id),
    rejected: num(row.rejected),
    started: num(row.started),
  }));
}

// Where cases spend their time: the slowest steps first
async function perStep(since: Date): Promise<StepRow[]> {
  const rows = await db.execute<Row>(sql`
    select
      t.name as name,
      w.name as process,
      count(*) as completed,
      avg(extract(epoch from t.completed_at - t.created_at)) as seconds
    from tasks t
    join process_instances i on i.id = t.instance_id
    join process_definitions p on p.id = i.definition_id
    join workflows w on w.id = p.workflow_id
    where t.status = 'completed' and t.completed_at >= ${asTimestamp(since)}
    group by t.name, w.name
    order by seconds desc
    limit 10
  `);
  return rows.map((row) => ({
    avgHours: hours(row.seconds),
    completed: num(row.completed),
    name: String(row.name),
    process: String(row.process),
  }));
}

async function perPerson(since: Date): Promise<PersonRow[]> {
  const rows = await db.execute<Row>(sql`
    select
      u.id as user_id,
      coalesce(nullif(u.name, ''), u.email) as name,
      count(t.id) filter (where t.status = 'pending' and t.assignee_id = u.id) as pending,
      count(t.id) filter (
        where t.status = 'pending' and t.assignee_id = u.id
          and t.due_at is not null and t.due_at < now()
      ) as overdue,
      count(t.id) filter (
        where t.status = 'completed' and t.completed_by_id = u.id
          and t.completed_at >= ${asTimestamp(since)}
      ) as completed,
      avg(extract(epoch from t.completed_at - t.created_at)) filter (
        where t.status = 'completed' and t.completed_by_id = u.id
          and t.completed_at >= ${asTimestamp(since)}
      ) as seconds
    from users u
    left join tasks t on t.assignee_id = u.id or t.completed_by_id = u.id
    where coalesce(u.is_anonymous, false) = false
    group by u.id, u.name, u.email
    having count(t.id) > 0
    order by overdue desc, pending desc, completed desc
  `);
  return rows.map((row) => ({
    avgHours: hours(row.seconds),
    completed: num(row.completed),
    name: String(row.name),
    overdue: num(row.overdue),
    pending: num(row.pending),
    userId: String(row.user_id),
  }));
}

export async function buildReport(days: number): Promise<ReportSummary> {
  const since = new Date(Date.now() - days * 24 * SECONDS_PER_HOUR * 1000);
  const [now, counts, avgCycleHours, perDay, byProcess, bySteps, byPerson] =
    await Promise.all([
      currentLoad(),
      statusCounts(since),
      cycleTime(since),
      startedPerDay(since, days),
      perProcess(since),
      perStep(since),
      perPerson(since),
    ]);

  const approved = counts.approved ?? 0;
  const rejected = counts.rejected ?? 0;
  return {
    approvalRate:
      approved + rejected > 0 ? approved / (approved + rejected) : null,
    approved,
    avgCycleHours,
    byPerson,
    byProcess,
    bySteps,
    cancelled: counts.cancelled ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    now,
    perDay,
    rangeDays: days,
    rejected,
    started: Object.values(counts).reduce((sum, n) => sum + n, 0),
  };
}
