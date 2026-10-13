import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PG_FOREIGN_KEY_VIOLATION, pgErrorCode } from "@/lib/db/errors";
import { departments } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/session";

const MAX_NAME_LENGTH = 80;
const MAX_DEPTH = 50;

// True when making `candidateParentId` the parent of `departmentId` would loop
async function createsCycle(departmentId: string, candidateParentId: string) {
  let current: string | null = candidateParentId;
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    if (current === departmentId) {
      return true;
    }
    const [row] = await db
      .select({ parentId: departments.parentId })
      .from(departments)
      .where(eq(departments.id, current))
      .limit(1);
    current = row?.parentId ?? null;
  }
  return false;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { departmentId } = await params;
  const body = (await request.json()) as { name?: string; parentId?: string | null };

  const [current] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, departmentId))
    .limit(1);
  if (!current) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const updates: { name?: string; parentId?: string | null } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name is required and must be at most ${MAX_NAME_LENGTH} characters` },
        { status: 400 }
      );
    }
    const [clash] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(
        and(
          eq(sql`lower(${departments.name})`, name.toLowerCase()),
          ne(departments.id, departmentId)
        )
      )
      .limit(1);
    if (clash) {
      return NextResponse.json(
        { error: "A department with this name already exists" },
        { status: 409 }
      );
    }
    updates.name = name;
  }

  if (body.parentId !== undefined) {
    if (body.parentId) {
      const [parent] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.id, body.parentId))
        .limit(1);
      if (!parent) {
        return NextResponse.json({ error: "Parent department not found" }, { status: 400 });
      }
      if (await createsCycle(departmentId, body.parentId)) {
        return NextResponse.json(
          { error: "A department cannot be placed under itself or its own sub-departments" },
          { status: 400 }
        );
      }
    }
    updates.parentId = body.parentId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(departments)
    .set(updates)
    .where(eq(departments.id, departmentId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { departmentId } = await params;

  try {
    const deleted = await db
      .delete(departments)
      .where(eq(departments.id, departmentId))
      .returning({ id: departments.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) {
      return NextResponse.json(
        { error: "This department is used by a process, task or case and cannot be deleted" },
        { status: 409 }
      );
    }
    throw error;
  }
}
