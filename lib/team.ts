import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type CaseViewer, canAccessCase } from "@/lib/db/bpma";
import type { Case } from "@/lib/db/schema";
import { teamCaseCondition } from "@/lib/team-sql";

// Can this manager read the case? Read-only: it never allows changes.
export async function canReadAsManager(
  viewer: { id: string; permissions: string[] },
  record: Case
): Promise<boolean> {
  if (!viewer.permissions.includes("team.view")) {
    return false;
  }
  const rows = await db.execute<{ ok: boolean }>(
    sql`SELECT EXISTS (
      SELECT 1 FROM cases WHERE cases.id = ${record.id} AND ${teamCaseCondition(viewer.id)}
    ) AS ok`
  );
  return rows[0]?.ok === true;
}

// How a person may open a case: "full" for people involved in it, "read" for
// a manager of someone involved, null for everyone else. Reading routes use
// this; anything that changes a case keeps using canAccessCase.
export async function caseAccess(
  viewer: CaseViewer,
  record: Case
): Promise<"full" | "read" | null> {
  if (await canAccessCase(viewer, record)) {
    return "full";
  }
  return (await canReadAsManager(viewer, record)) ? "read" : null;
}
