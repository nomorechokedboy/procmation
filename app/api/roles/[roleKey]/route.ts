import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
} from "@/lib/db/errors";
import { roles } from "@/lib/db/schema";
import { parseRoleInput } from "@/lib/role-input";
import { requirePermission } from "@/lib/session";

type Params = { params: Promise<{ roleKey: string }> };

const notFound = () =>
  NextResponse.json({ error: "Role not found" }, { status: 404 });
const builtIn = () =>
  NextResponse.json(
    { error: "Admin and Member are built in and cannot be changed" },
    { status: 409 }
  );

// PATCH /api/roles/:key - edits a role's name, description and permissions.
// The key stays the same, so renaming never disturbs who holds the role.
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requirePermission(request, "roles.manage");
  if (!guard.ok) {
    return guard.response;
  }

  const { roleKey } = await params;
  const [current] = await db.select().from(roles).where(eq(roles.key, roleKey));
  if (!current) {
    return notFound();
  }
  if (current.isSystem) {
    return builtIn();
  }

  const body = await readJsonObject(request);
  const parsed = body ? parseRoleInput(body) : null;
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(roles)
      .set({ ...parsed.value, updatedAt: new Date() })
      .where(eq(roles.key, roleKey))
      .returning();
    recordAudit({
      action: "updated",
      actor: userActor(guard.user),
      metadata: {
        from: { name: current.name, permissions: current.permissions },
        to: { name: updated.name, permissions: updated.permissions },
      },
      resourceId: roleKey,
      resourceLabel: updated.name,
      resourceType: AUDIT_RESOURCES.role,
      summary: `${guard.user.name} changed the role ${updated.name}`,
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      return NextResponse.json(
        { error: "A role with this name already exists" },
        { status: 409 }
      );
    }
    throw error;
  }
}

// DELETE /api/roles/:key - only a role nobody holds and no invitation uses
export async function DELETE(request: Request, { params }: Params) {
  const guard = await requirePermission(request, "roles.manage");
  if (!guard.ok) {
    return guard.response;
  }

  const { roleKey } = await params;
  const [current] = await db.select().from(roles).where(eq(roles.key, roleKey));
  if (!current) {
    return notFound();
  }
  if (current.isSystem) {
    return builtIn();
  }

  try {
    await db.delete(roles).where(eq(roles.key, roleKey));
  } catch (error) {
    if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) {
      return NextResponse.json(
        {
          error:
            "This role is held by someone or used by an invitation. Move them to another role first.",
        },
        { status: 409 }
      );
    }
    throw error;
  }
  recordAudit({
    action: "deleted",
    actor: userActor(guard.user),
    resourceId: roleKey,
    resourceLabel: current.name,
    resourceType: AUDIT_RESOURCES.role,
    summary: `${guard.user.name} deleted the role ${current.name}`,
  });
  return NextResponse.json({ success: true });
}
