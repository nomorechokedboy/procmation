import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { departments, userProfiles, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/session";

const MAX_DEPTH = 50;
const MAX_JOB_TITLE_LENGTH = 100;

type ProfileBody = {
  departmentId?: string | null;
  managerId?: string | null;
  jobTitle?: string | null;
};

// True when making `managerId` the manager of `memberId` would loop back
async function createsManagerCycle(memberId: string, managerId: string) {
  // Walk up the management chain from the new manager; reaching the member means a loop
  const found = await db.execute(sql`
    WITH RECURSIVE chain(user_id, manager_id, depth) AS (
      SELECT ${managerId}::text, (SELECT manager_id FROM user_profiles WHERE user_id = ${managerId}), 1
      UNION ALL
      SELECT p.user_id, p.manager_id, c.depth + 1
      FROM user_profiles p
      JOIN chain c ON p.user_id = c.manager_id
      WHERE c.depth < ${MAX_DEPTH}
    )
    SELECT 1 FROM chain WHERE user_id = ${memberId} OR manager_id = ${memberId} LIMIT 1
  `);
  return found.length > 0;
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

// An error message when the department cannot be assigned, nothing when it can
async function checkDepartment(
  departmentId: string | null
): Promise<string | undefined> {
  if (!departmentId) {
    return;
  }
  const [department] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.id, departmentId))
    .limit(1);
  return department ? undefined : "Department not found";
}

// An error message when the manager cannot be assigned, nothing when they can
async function checkManager(
  memberId: string,
  managerId: string | null
): Promise<string | undefined> {
  if (!managerId) {
    return;
  }
  if (managerId === memberId) {
    return "A person cannot be their own manager";
  }
  const [manager] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, managerId))
    .limit(1);
  if (!manager) {
    return "Manager not found";
  }
  if (await createsManagerCycle(memberId, managerId)) {
    return "That would make the reporting line loop back on itself";
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { memberId } = await params;
  const body = (await request.json()) as ProfileBody;

  const [member] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, memberId))
    .limit(1);
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const updates: ProfileBody = {};

  if (body.departmentId !== undefined) {
    const error = await checkDepartment(body.departmentId);
    if (error) {
      return badRequest(error);
    }
    updates.departmentId = body.departmentId;
  }

  if (body.managerId !== undefined) {
    const error = await checkManager(memberId, body.managerId);
    if (error) {
      return badRequest(error);
    }
    updates.managerId = body.managerId;
  }

  if (body.jobTitle !== undefined) {
    const jobTitle = body.jobTitle?.trim() || null;
    if (jobTitle && jobTitle.length > MAX_JOB_TITLE_LENGTH) {
      return badRequest(
        `Job title must be at most ${MAX_JOB_TITLE_LENGTH} characters`
      );
    }
    updates.jobTitle = jobTitle;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db
    .insert(userProfiles)
    .values({ userId: memberId, ...updates })
    .onConflictDoUpdate({
      set: { ...updates, updatedAt: new Date() },
      target: userProfiles.userId,
    });

  return NextResponse.json({ success: true });
}
