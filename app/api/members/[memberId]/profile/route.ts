import { eq } from "drizzle-orm";
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
  let current: string | null = managerId;
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    if (current === memberId) {
      return true;
    }
    const [row] = await db
      .select({ managerId: userProfiles.managerId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, current))
      .limit(1);
    current = row?.managerId ?? null;
  }
  return false;
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
    if (body.departmentId) {
      const [department] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.id, body.departmentId))
        .limit(1);
      if (!department) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 400 }
        );
      }
    }
    updates.departmentId = body.departmentId;
  }

  if (body.managerId !== undefined) {
    if (body.managerId) {
      if (body.managerId === memberId) {
        return NextResponse.json(
          { error: "A person cannot be their own manager" },
          { status: 400 }
        );
      }
      const [manager] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, body.managerId))
        .limit(1);
      if (!manager) {
        return NextResponse.json(
          { error: "Manager not found" },
          { status: 400 }
        );
      }
      if (await createsManagerCycle(memberId, body.managerId)) {
        return NextResponse.json(
          { error: "That would make the reporting line loop back on itself" },
          { status: 400 }
        );
      }
    }
    updates.managerId = body.managerId;
  }

  if (body.jobTitle !== undefined) {
    const jobTitle = body.jobTitle?.trim() || null;
    if (jobTitle && jobTitle.length > MAX_JOB_TITLE_LENGTH) {
      return NextResponse.json(
        {
          error: `Job title must be at most ${MAX_JOB_TITLE_LENGTH} characters`,
        },
        { status: 400 }
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
