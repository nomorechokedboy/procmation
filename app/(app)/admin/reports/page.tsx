"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { formatHours, formatPercent } from "@/components/reports/format";
import { ReportTable } from "@/components/reports/report-table";
import { StartedChart } from "@/components/reports/started-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api, type Report } from "@/lib/api-client";
import * as m from "@/paraglide/messages";

const RANGES = ["7", "30", "90"] as const;

function rangeLabel(range: string): string {
  if (range === "7") {
    return m.reports_range_7();
  }
  return range === "90" ? m.reports_range_90() : m.reports_range_30();
}

type TileProps = {
  label: string;
  value: string;
  note?: string;
  testId: string;
  alert?: boolean;
};

// A headline number. Nothing to plot, so it is a tile and not a chart.
function Tile({ label, value, note, testId, alert }: TileProps) {
  return (
    <Card className="gap-1 py-4" data-testid={testId}>
      <CardHeader className="gap-0">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            alert
              ? "font-semibold text-2xl text-destructive tabular-nums"
              : "font-semibold text-2xl tabular-nums"
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
      {note ? (
        <CardContent className="text-muted-foreground text-xs">
          {note}
        </CardContent>
      ) : null}
    </Card>
  );
}

function Tiles({ report }: { report: Report }) {
  const decided = report.approved + report.rejected;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Tile
        label={m.reports_started()}
        note={m.reports_failed_note({
          cancelled: report.cancelled,
          failed: report.failed,
        })}
        testId="tile-started"
        value={String(report.started)}
      />
      <Tile
        label={m.reports_active()}
        testId="tile-active"
        value={String(report.now.activeCases)}
      />
      <Tile
        alert={report.now.overdueTasks > 0}
        label={m.reports_overdue()}
        note={m.reports_overdue_note({ count: report.now.escalatedTasks })}
        testId="tile-overdue"
        value={String(report.now.overdueTasks)}
      />
      <Tile
        label={m.reports_approval_rate()}
        note={
          decided > 0
            ? m.reports_approval_note({
                approved: report.approved,
                rejected: report.rejected,
              })
            : m.reports_approval_none()
        }
        testId="tile-approval"
        value={formatPercent(report.approvalRate)}
      />
      <Tile
        label={m.reports_cycle()}
        note={
          report.avgCycleHours === null ? m.reports_cycle_none() : undefined
        }
        testId="tile-cycle"
        value={formatHours(report.avgCycleHours)}
      />
    </div>
  );
}

function Tables({ report }: { report: Report }) {
  return (
    <>
      <ReportTable
        columns={[
          m.reports_col_process(),
          m.reports_col_started(),
          m.reports_col_approved(),
          m.reports_col_rejected(),
          m.reports_col_active(),
          m.reports_col_time(),
        ]}
        filename="reports-by-process.csv"
        rows={report.byProcess.map((row) => ({
          cells: [
            row.name,
            row.started,
            row.approved,
            row.rejected,
            row.active,
            row.avgCycleHours,
          ],
          display: [
            row.name,
            String(row.started),
            String(row.approved),
            String(row.rejected),
            String(row.active),
            formatHours(row.avgCycleHours),
          ],
          key: row.processId,
        }))}
        testId="by-process"
        title={m.reports_by_process()}
      />
      <ReportTable
        columns={[
          m.reports_col_step(),
          m.reports_col_process(),
          m.reports_col_done(),
          m.reports_col_time(),
        ]}
        filename="reports-slowest-steps.csv"
        hint={m.reports_steps_hint()}
        rows={report.bySteps.map((row) => ({
          cells: [row.name, row.process, row.completed, row.avgHours],
          display: [
            row.name,
            row.process,
            String(row.completed),
            formatHours(row.avgHours),
          ],
          key: `${row.process}/${row.name}`,
        }))}
        testId="by-step"
        title={m.reports_steps()}
      />
      <ReportTable
        columns={[
          m.reports_col_person(),
          m.reports_col_pending(),
          m.reports_col_overdue(),
          m.reports_col_done(),
          m.reports_col_time(),
        ]}
        filename="reports-workload.csv"
        rows={report.byPerson.map((row) => ({
          cells: [
            row.name,
            row.pending,
            row.overdue,
            row.completed,
            row.avgHours,
          ],
          display: [
            row.name,
            String(row.pending),
            String(row.overdue),
            String(row.completed),
            formatHours(row.avgHours),
          ],
          key: row.userId,
        }))}
        testId="by-person"
        title={m.reports_people()}
      />
    </>
  );
}

export default function ReportsPage() {
  const [range, setRange] = useState<string>("30");
  const [report, setReport] = useState<Report | null>(null);
  const handleRange = useStableCallback((value: string) => setRange(value));

  useEffect(() => {
    api.report
      .get(Number(range))
      .then(setReport)
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : m.load_failed())
      );
  }, [range]);

  return (
    <>
      <PageHeader
        actions={
          <Select onValueChange={handleRange} value={range}>
            <SelectTrigger className="w-40" data-testid="report-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((value) => (
                <SelectItem key={value} value={value}>
                  {rangeLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        title={m.reports_title()}
      />
      {report ? (
        <>
          <Tiles report={report} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {m.reports_chart_title()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StartedChart points={report.perDay} />
            </CardContent>
          </Card>
          <Tables report={report} />
        </>
      ) : null}
    </>
  );
}
