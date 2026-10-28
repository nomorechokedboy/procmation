import "server-only";

import { lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

// A fixed window counter kept in the database, so every app instance counts
// the same calls. One upsert both counts the call and tells how many came
// before it in the window.
export async function allowCall(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): Promise<boolean> {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ count: 1, key, windowStart })
    .onConflictDoUpdate({
      set: { count: sql`${rateLimits.count} + 1` },
      target: [rateLimits.key, rateLimits.windowStart],
    })
    .returning({ count: rateLimits.count });
  return (row?.count ?? 1) <= limit;
}

// Windows older than an hour can never be counted again
export async function clearRateLimitWindows(): Promise<void> {
  await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(Date.now() - 60 * 60_000)));
}
