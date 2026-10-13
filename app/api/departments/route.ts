import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { departments, userProfiles } from "@/lib/db/schema";
import { requireAdmin, requireUser } from "@/lib/session";

const MAX_NAME_LENGTH = 80;

export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const rows = await db
    .select({
      id: departments.id,
      name: departments.name,
      parentId: departments.parentId,
      memberCount: sql<number>`count(${userProfiles.userId})::int`,
    })
    .from(departments)
    .leftJoin(userProfiles, eq(userProfiles.departmentId, departments.id))
    .groupBy(departments.id)
    .orderBy(asc(departments.name));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = (await request.json()) as { name?: string; parentId?: string | null };
  const name = body.name?.trim() ?? "";

  if (!name || name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Name is required and must be at most ${MAX_NAME_LENGTH} characters` },
      { status: 400 }
    );
  }

  if (body.parentId) {
    const [parent] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.id, body.parentId))
      .limit(1);
    if (!parent) {
      return NextResponse.json({ error: "Parent department not found" }, { status: 400 });
    }
  }

  const [existing] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(sql`lower(${departments.name})`, name.toLowerCase()))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "A department with this name already exists" },
      { status: 409 }
    );
  }

  const [created] = await db
    .insert(departments)
    .values({ name, parentId: body.parentId ?? null })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
