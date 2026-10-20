import { asc, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userProfiles, users } from "@/lib/db/schema";
import { requirePermission } from "@/lib/session";

export async function GET(request: Request) {
  const guard = await requirePermission(request, "members.manage");
  if (!guard.ok) {
    return guard.response;
  }

  const rows = await db
    .select({
      createdAt: users.createdAt,
      departmentId: userProfiles.departmentId,
      email: users.email,
      id: users.id,
      jobTitle: userProfiles.jobTitle,
      managerId: userProfiles.managerId,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    // Legacy anonymous template users are not members
    .where(or(isNull(users.isAnonymous), eq(users.isAnonymous, false)))
    .orderBy(asc(users.createdAt));

  return NextResponse.json(rows);
}
