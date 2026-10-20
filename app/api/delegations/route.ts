import { and, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import { AUDIT_RESOURCES, recordAudit, userActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { delegations, users } from "@/lib/db/schema";
import { hasOverlap, listCurrentDelegations } from "@/lib/delegations";
import { requireUser } from "@/lib/session";

// GET /api/delegations - current and upcoming ones that involve you.
// ?all=true lists everyone's and needs members.manage.
export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const all = new URL(request.url).searchParams.get("all") === "true";
  if (all && !guard.user.permissions.includes("members.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    await listCurrentDelegations(all ? null : guard.user.id)
  );
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function findPerson(id: string) {
  const [person] = await db
    .select({ email: users.email, id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.id, id),
        or(isNull(users.isAnonymous), eq(users.isAnonymous, false))
      )
    );
  return person ?? null;
}

// POST /api/delegations
// Body: { toUserId, startsAt, endsAt, fromUserId? }. You hand over your own
// new tasks; with members.manage you can do it for someone else.
export async function POST(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = await readJsonObject(request);
  const startsAt = parseDate(body?.startsAt);
  const endsAt = parseDate(body?.endsAt);
  if (
    !body ||
    typeof body.toUserId !== "string" ||
    !startsAt ||
    !endsAt ||
    endsAt <= startsAt
  ) {
    return NextResponse.json(
      { error: "Choose who covers and a start before the end" },
      { status: 400 }
    );
  }
  if (endsAt <= new Date()) {
    return NextResponse.json(
      { error: "The end must be in the future" },
      { status: 400 }
    );
  }

  const fromUserId =
    typeof body.fromUserId === "string" ? body.fromUserId : guard.user.id;
  if (
    fromUserId !== guard.user.id &&
    !guard.user.permissions.includes("members.manage")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (fromUserId === body.toUserId) {
    return NextResponse.json(
      { error: "Pick someone else to cover" },
      { status: 400 }
    );
  }

  const [from, to] = await Promise.all([
    findPerson(fromUserId),
    findPerson(body.toUserId),
  ]);
  if (!(from && to)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (await hasOverlap(fromUserId, startsAt, endsAt)) {
    return NextResponse.json(
      { error: "Those dates overlap another delegation" },
      { status: 409 }
    );
  }

  const [created] = await db
    .insert(delegations)
    .values({
      createdById: guard.user.id,
      endsAt,
      fromUserId,
      startsAt,
      toUserId: to.id,
    })
    .returning();

  const fromName = from.name || from.email;
  const toName = to.name || to.email;
  recordAudit([
    {
      action: "created",
      actor: userActor(guard.user),
      metadata: {
        endsAt: endsAt.toISOString(),
        from: from.id,
        startsAt: startsAt.toISOString(),
        to: to.id,
      },
      resourceId: created.id,
      resourceLabel: `${fromName} → ${toName}`,
      resourceType: AUDIT_RESOURCES.delegation,
      summary: `${guard.user.name} set ${toName} to cover new tasks for ${fromName} from ${startsAt.toISOString()} to ${endsAt.toISOString()}`,
    },
  ]);

  return NextResponse.json(created, { status: 201 });
}
