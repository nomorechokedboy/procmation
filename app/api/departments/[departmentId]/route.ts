import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { PG_FOREIGN_KEY_VIOLATION, pgErrorCode } from "@/lib/db/errors";
import { departments } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/session";

const MAX_NAME_LENGTH = 80;
const MAX_DEPTH = 50;

// True when making `candidateParentId` the parent of `departmentId` would loop
async function createsCycle(departmentId: string, candidateParentId: string) {
  // Walk up from the candidate parent; reaching the department means a loop
  const found = await db.execute(sql`
    WITH RECURSIVE ancestors(id, parent_id, depth) AS (
      SELECT id, parent_id, 1 FROM departments WHERE id = ${candidateParentId}
      UNION ALL
      SELECT d.id, d.parent_id, a.depth + 1
      FROM departments d
      JOIN ancestors a ON d.id = a.parent_id
      WHERE a.depth < ${MAX_DEPTH}
    )
    SELECT 1 FROM ancestors WHERE id = ${departmentId} LIMIT 1
  `);
  return found.length > 0;
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
  const body = (await request.json()) as {
    name?: string;
    parentId?: string | null;
  };

  const [current] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, departmentId))
    .limit(1);
  if (!current) {
    return NextResponse.json(
      { error: "Department not found" },
      { status: 404 }
    );
  }

  const updates: { name?: string; parentId?: string | null } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        {
          error: `Name is required and must be at most ${MAX_NAME_LENGTH} characters`,
        },
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
        return NextResponse.json(
          { error: "Parent department not found" },
          { status: 400 }
        );
      }
      if (await createsCycle(departmentId, body.parentId)) {
        return NextResponse.json(
          {
            error:
              "A department cannot be placed under itself or its own sub-departments",
          },
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

  recordAudit({
    action: "updated",
    actor: userActor(guard.user),
    metadata: {
      changed: Object.keys(updates),
      from: { name: current.name, parentId: current.parentId },
    },
    resourceId: departmentId,
    resourceLabel: updated.name,
    resourceType: AUDIT_RESOURCES.department,
    summary: `${guard.user.name} updated department ${updated.name}`,
  });

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
      .returning({ id: departments.id, name: departments.name });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }
    recordAudit({
      action: "deleted",
      actor: userActor(guard.user),
      resourceId: departmentId,
      resourceLabel: deleted[0].name,
      resourceType: AUDIT_RESOURCES.department,
      summary: `${guard.user.name} deleted department ${deleted[0].name}`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) {
      return NextResponse.json(
        {
          error:
            "This department is used by a process, task or case and cannot be deleted",
        },
        { status: 409 }
      );
    }
    throw error;
  }
}
