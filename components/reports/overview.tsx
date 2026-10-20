"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Tile } from "@/components/reports/tile";
import { api, type Report } from "@/lib/api-client";
import * as m from "@/paraglide/messages";

const WEEK = 7;

// The admin's glance at the week on the home page; the full figures are on
// the Reports page. Quietly absent if the figures cannot be loaded.
export function Overview() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    api.report
      .get(WEEK)
      .then(setReport)
      .catch(() => setReport(null));
  }, []);

  if (!report) {
    return null;
  }

  return (
    <section className="space-y-2" data-testid="home-overview">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm">{m.home_overview_title()}</h2>
        <Link
          className="text-muted-foreground text-xs underline"
          href="/admin/reports"
        >
          {m.home_overview_link()}
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label={m.reports_started()}
          testId="overview-started"
          value={String(report.started)}
        />
        <Tile
          label={m.reports_active()}
          testId="overview-active"
          value={String(report.now.activeCases)}
        />
        <Tile
          alert={report.now.overdueTasks > 0}
          label={m.reports_overdue()}
          testId="overview-overdue"
          value={String(report.now.overdueTasks)}
        />
      </div>
    </section>
  );
}
