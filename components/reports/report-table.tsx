"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useStableCallback } from "@/hooks/use-stable-callback";
import * as m from "@/paraglide/messages";
import { downloadCsv, toCsv } from "./format";

type Cell = string | number | null;

type ReportTableProps = {
  title: string;
  hint?: string;
  testId: string;
  // The first column is text; the rest are figures
  columns: string[];
  rows: { key: string; cells: Cell[]; display?: string[] }[];
  filename: string;
};

// A titled table that can also be saved as CSV (with the raw numbers, not the
// formatted ones, so a spreadsheet can calculate with them)
export function ReportTable({
  title,
  hint,
  testId,
  columns,
  rows,
  filename,
}: ReportTableProps) {
  const exportCsv = useStableCallback(() =>
    downloadCsv(
      filename,
      toCsv(
        columns,
        rows.map((row) => row.cells)
      )
    )
  );

  return (
    <Card data-testid={testId}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {rows.length > 0 ? (
            <Button onClick={exportCsv} size="sm" type="button" variant="ghost">
              <Download className="mr-1 size-4" />
              {m.reports_export()}
            </Button>
          ) : null}
        </div>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{m.reports_empty()}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground text-xs">
                  {columns.map((column, index) => (
                    <th
                      className={
                        index === 0
                          ? "pb-2 font-normal"
                          : "pb-2 text-right font-normal"
                      }
                      key={column}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr data-testid={`${testId}-row`} key={row.key}>
                    {(row.display ?? row.cells.map(String)).map(
                      (value, index) => (
                        <td
                          className={
                            index === 0
                              ? "py-2 pr-2"
                              : "py-2 text-right tabular-nums"
                          }
                          // biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed
                          key={index}
                        >
                          {value}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
