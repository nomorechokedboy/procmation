import { NextResponse } from "next/server";
import { buildReport, parseRange } from "@/lib/reports";
import { requirePermission } from "@/lib/session";

// GET /api/reports?days=7|30|90 - figures for the dashboard (admins only)
export async function GET(request: Request) {
  const guard = await requirePermission(request, "reports.view");
  if (!guard.ok) {
    return guard.response;
  }
  const days = parseRange(new URL(request.url).searchParams.get("days"));
  return NextResponse.json(await buildReport(days));
}
