import { NextResponse } from "next/server";
import { findAuditLogs } from "@/lib/audit";
import { requirePermission } from "@/lib/session";

const MAX_LIMIT_PARAM = 200;

function param(url: URL, name: string): string | undefined {
  return url.searchParams.get(name) || undefined;
}

// GET /api/audit-logs - the audit log, newest first (admins only). Entries are
// only ever added; there is no way to change or remove one through the API.
// Query: resourceType, resourceId, action, actorId, q, before, limit
export async function GET(request: Request) {
  const guard = await requirePermission(request, "audit.view");
  if (!guard.ok) {
    return guard.response;
  }

  const url = new URL(request.url);
  const limit = Number(param(url, "limit"));
  const page = await findAuditLogs({
    action: param(url, "action"),
    actorId: param(url, "actorId"),
    before: param(url, "before"),
    limit:
      Number.isFinite(limit) && limit > 0
        ? Math.min(limit, MAX_LIMIT_PARAM)
        : undefined,
    resourceId: param(url, "resourceId"),
    resourceType: param(url, "resourceType"),
    search: param(url, "q"),
  });
  return NextResponse.json(page);
}
