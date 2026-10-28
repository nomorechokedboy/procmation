import { and, asc, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

// GET /api/people - names to pick from, such as who covers while you are away.
// Anyone signed in can read it, so it holds nothing but id, name and email.
export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const rows = await db
    .select({ email: users.email, id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        or(isNull(users.isAnonymous), eq(users.isAnonymous, false)),
        eq(users.isService, false)
      )
    )
    .orderBy(asc(users.name));

  return NextResponse.json(rows);
}
