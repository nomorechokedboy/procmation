import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/db/errors";
import { roles, users } from "@/lib/db/schema";
import { parseRoleInput, roleKeyFromName } from "@/lib/role-input";
import { requireUser } from "@/lib/session";

// GET /api/roles - every role with how many people hold it. Whoever manages
// members or roles needs the list, to pick a role for someone.
export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { permissions } = guard.user;
  if (
    !(
      permissions.includes("members.manage") ||
      permissions.includes("roles.manage")
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      description: roles.description,
      isSystem: roles.isSystem,
      key: roles.key,
      memberCount: sql<number>`count(${users.id})::int`,
      name: roles.name,
      permissions: roles.permissions,
    })
    .from(roles)
    .leftJoin(users, eq(users.role, roles.key))
    .groupBy(roles.key)
    .orderBy(asc(roles.isSystem), asc(roles.name));
  return NextResponse.json(rows);
}

// POST /api/roles - makes a role. Body: { name, description?, permissions }
export async function POST(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (!guard.user.permissions.includes("roles.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const { name, description, permissions } = parsed.value;
  try {
    const [created] = await db
      .insert(roles)
      .values({ description, key: roleKeyFromName(name), name, permissions })
      .returning();
    recordAudit({
      action: "created",
      actor: userActor(guard.user),
      metadata: { permissions },
      resourceId: created.key,
      resourceLabel: created.name,
      resourceType: AUDIT_RESOURCES.role,
      summary: `${guard.user.name} created the role ${created.name}`,
    });
    return NextResponse.json(created, { status: 201 });
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
