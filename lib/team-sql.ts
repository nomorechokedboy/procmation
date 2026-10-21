import "server-only";

import { type SQL, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases } from "@/lib/db/schema";

// Everyone who reports to this person, directly or through other managers.
// The cycle guard keeps a bad manager loop from running forever.
const REPORTS_CTE = (userId: string) => sql`
  WITH RECURSIVE chain(user_id, depth) AS (
    SELECT user_id, 1 FROM user_profiles WHERE manager_id = ${userId}
    UNION
    SELECT p.user_id, c.depth + 1
    FROM user_profiles p JOIN chain c ON p.manager_id = c.user_id
    WHERE c.depth < 20
  )`;

export async function reportIdsOf(userId: string): Promise<string[]> {
  const rows = await db.execute<{ user_id: string }>(
    sql`${REPORTS_CTE(userId)} SELECT DISTINCT user_id FROM chain WHERE user_id <> ${userId}`
  );
  return rows.map((row) => row.user_id);
}

// SQL for "this case belongs to someone who reports to the viewer": they
// started it, or hold or finished a task on it
export function teamCaseCondition(userId: string): SQL {
  return sql`(
    ${cases.initiatorId} IN (SELECT user_id FROM (${REPORTS_CTE(userId)} SELECT user_id FROM chain) AS reports)
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.instance_id = ${cases.processInstanceId}
        AND (
          t.assignee_id IN (SELECT user_id FROM (${REPORTS_CTE(userId)} SELECT user_id FROM chain) AS reports)
          OR t.completed_by_id IN (SELECT user_id FROM (${REPORTS_CTE(userId)} SELECT user_id FROM chain) AS reports)
        )
    )
  )`;
}
