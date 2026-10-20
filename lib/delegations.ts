import "server-only";

import { and, desc, eq, gt, isNull, lt, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { delegations, users } from "@/lib/db/schema";

export type DelegationRow = {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  startsAt: Date;
  endsAt: Date;
  revokedAt: Date | null;
};

// Who covers for this person at this moment, if anyone. One hop only: a
// delegate who is also away does not pass the task on again.
export async function activeDelegateFor(
  userId: string,
  at: Date
): Promise<string | null> {
  const [found] = await db
    .select({ toUserId: delegations.toUserId })
    .from(delegations)
    .where(
      and(
        eq(delegations.fromUserId, userId),
        isNull(delegations.revokedAt),
        lte(delegations.startsAt, at),
        gt(delegations.endsAt, at)
      )
    )
    .orderBy(desc(delegations.startsAt))
    .limit(1);
  return found?.toUserId ?? null;
}

// Is there already a delegation for this person that overlaps the range?
export async function hasOverlap(
  fromUserId: string,
  startsAt: Date,
  endsAt: Date
): Promise<boolean> {
  const [found] = await db
    .select({ id: delegations.id })
    .from(delegations)
    .where(
      and(
        eq(delegations.fromUserId, fromUserId),
        isNull(delegations.revokedAt),
        lt(delegations.startsAt, endsAt),
        gt(delegations.endsAt, startsAt)
      )
    )
    .limit(1);
  return Boolean(found);
}

const fromUser = alias(users, "from_user");
const toUser = alias(users, "to_user");

const displayName = (name: string | null, email: string | null) =>
  name || email || "";

// Delegations that have not ended or been revoked, for one person (as the
// one away or as the delegate) or for everyone
export async function listCurrentDelegations(
  userId: string | null
): Promise<DelegationRow[]> {
  const rows = await db
    .select({
      endsAt: delegations.endsAt,
      fromEmail: fromUser.email,
      fromName: fromUser.name,
      fromUserId: delegations.fromUserId,
      id: delegations.id,
      revokedAt: delegations.revokedAt,
      startsAt: delegations.startsAt,
      toEmail: toUser.email,
      toName: toUser.name,
      toUserId: delegations.toUserId,
    })
    .from(delegations)
    .innerJoin(fromUser, eq(fromUser.id, delegations.fromUserId))
    .innerJoin(toUser, eq(toUser.id, delegations.toUserId))
    .where(
      and(
        isNull(delegations.revokedAt),
        gt(delegations.endsAt, new Date()),
        userId
          ? or(
              eq(delegations.fromUserId, userId),
              eq(delegations.toUserId, userId)
            )
          : undefined
      )
    )
    .orderBy(delegations.startsAt);

  return rows.map((row) => ({
    endsAt: row.endsAt,
    fromName: displayName(row.fromName, row.fromEmail),
    fromUserId: row.fromUserId,
    id: row.id,
    revokedAt: row.revokedAt,
    startsAt: row.startsAt,
    toName: displayName(row.toName, row.toEmail),
    toUserId: row.toUserId,
  }));
}
