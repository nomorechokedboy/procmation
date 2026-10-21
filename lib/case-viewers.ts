import "server-only";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type Case, roles, tasks, userProfiles, users } from "@/lib/db/schema";
import { ADMIN_ROLE } from "@/lib/permissions";

export type CaseViewerPerson = { id: string; name: string };

// Everyone who can open this case: the same rule as canAccessCase, answered
// for all users at once. Used to offer @mentions and to check them.
export async function listCaseViewers(
  record: Case
): Promise<CaseViewerPerson[]> {
  const ids = new Set<string>([record.initiatorId, ...record.participants]);

  // Roles that can see every case (an admin always can)
  const wide = await db
    .select({ key: roles.key })
    .from(roles)
    .where(sql`${roles.permissions} @> '["cases.view_all"]'::jsonb`);
  const wideRoles = [ADMIN_ROLE, ...wide.map((role) => role.key)];
  const everyone = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, wideRoles));
  for (const row of everyone) {
    ids.add(row.id);
  }

  // People with (or who had) a task on it, and the pools it sits in
  if (record.processInstanceId) {
    const caseTasks = await db
      .select({
        assigneeDepartmentId: tasks.assigneeDepartmentId,
        assigneeId: tasks.assigneeId,
        completedById: tasks.completedById,
      })
      .from(tasks)
      .where(eq(tasks.instanceId, record.processInstanceId));
    const poolIds = new Set<string>();
    for (const task of caseTasks) {
      for (const id of [task.assigneeId, task.completedById]) {
        if (id) {
          ids.add(id);
        }
      }
      if (!task.assigneeId && task.assigneeDepartmentId) {
        poolIds.add(task.assigneeDepartmentId);
      }
    }
    if (poolIds.size > 0) {
      const members = await db
        .select({ userId: userProfiles.userId })
        .from(userProfiles)
        .where(inArray(userProfiles.departmentId, [...poolIds]));
      for (const member of members) {
        ids.add(member.userId);
      }
    }
  }

  const people = await db
    .select({ email: users.email, id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        inArray(users.id, [...ids]),
        or(isNull(users.isAnonymous), eq(users.isAnonymous, false))
      )
    );
  return people
    .map((person) => ({
      id: person.id,
      name: person.name || person.email || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
