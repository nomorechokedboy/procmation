import { NextResponse } from "next/server";
import { parseCaseFilters } from "@/lib/case-filters";
import { listCases } from "@/lib/db/bpma";
import { requirePermission } from "@/lib/session";

// GET /api/team/cases - cases of the people who report to you, read-only.
// Takes the same filters as /api/bpma/cases.
export async function GET(request: Request) {
  const guard = await requirePermission(request, "team.view");
  if (!guard.ok) {
    return guard.response;
  }

  const parsed = parseCaseFilters(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  return NextResponse.json(
    await listCases({ ...parsed.filters, teamOf: guard.user.id })
  );
}
