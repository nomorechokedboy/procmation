import { asc, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userProfiles, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/session";

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      departmentId: userProfiles.departmentId,
      managerId: userProfiles.managerId,
      jobTitle: userProfiles.jobTitle,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    // Legacy anonymous template users are not members
    .where(or(isNull(users.isAnonymous), eq(users.isAnonymous, false)))
    .orderBy(asc(users.createdAt));

  return NextResponse.json(rows);
}
