import "server-only";

import { and, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { type AuditLog, auditLogs } from "@/lib/db/schema";

// Resource types written so far. The column is free text, so a new kind of
// resource needs no migration: pick a name and start writing.
export const AUDIT_RESOURCES = {
  case: "case",
  department: "department",
  invite: "invite",
  member: "member",
  process: "process",
  task: "task",
  workflow: "workflow",
} as const;

export type AuditActor = { id: string; name: string } | "system";

export type AuditEntry = {
  actor: AuditActor;
  resourceType: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  action: string;
  // One readable sentence, in English
  summary: string;
  parent?: { type: string; id: string; label?: string | null };
  // Facts a reader may want later, such as the old and new value
  metadata?: Record<string, unknown>;
};

// Anything with an insert, so entries can join the caller's transaction
type Writer = Pick<typeof db, "insert">;

export function userActor(user: { id: string; name: string; email: string }) {
  return { id: user.id, name: user.name || user.email } satisfies AuditActor;
}

// Appends one entry. Pass a transaction as `writer` when the change it
// describes is made in one, so both succeed or fail together.
export async function recordAudit(
  entry: AuditEntry,
  writer: Writer = db
): Promise<void> {
  const actor = entry.actor === "system" ? null : entry.actor;
  await writer.insert(auditLogs).values({
    action: entry.action,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    metadata: entry.metadata ?? null,
    parentId: entry.parent?.id ?? null,
    parentLabel: entry.parent?.label ?? null,
    parentType: entry.parent?.type ?? null,
    resourceId: entry.resourceId ?? null,
    resourceLabel: entry.resourceLabel ?? null,
    resourceType: entry.resourceType,
    summary: entry.summary,
  });
}

export type AuditQuery = {
  resourceType?: string;
  resourceId?: string;
  action?: string;
  actorId?: string;
  search?: string;
  // Entries older than this one, for the next page
  before?: string;
  limit?: number;
};

export type AuditPage = { entries: AuditLog[]; nextBefore: string | null };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function filtersFor(query: AuditQuery): SQL[] {
  const filters: SQL[] = [];
  if (query.resourceType) {
    filters.push(eq(auditLogs.resourceType, query.resourceType));
  }
  if (query.resourceId) {
    // A record's history includes what happened to the things inside it
    const own = eq(auditLogs.resourceId, query.resourceId);
    const child = eq(auditLogs.parentId, query.resourceId);
    filters.push(or(own, child) as SQL);
  }
  if (query.action) {
    filters.push(eq(auditLogs.action, query.action));
  }
  if (query.actorId) {
    filters.push(eq(auditLogs.actorId, query.actorId));
  }
  if (query.search?.trim()) {
    const pattern = `%${escapeLike(query.search.trim())}%`;
    filters.push(
      or(
        ilike(auditLogs.summary, pattern),
        ilike(auditLogs.resourceLabel, pattern),
        ilike(auditLogs.parentLabel, pattern),
        ilike(auditLogs.actorName, pattern)
      ) as SQL
    );
  }
  return filters;
}

// Newest first. Pages are keyed by time and id, so new entries arriving
// while someone scrolls never shift the page they are on.
export async function findAuditLogs(query: AuditQuery): Promise<AuditPage> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  const filters = filtersFor(query);

  if (query.before) {
    const [cursor] = await db
      .select({ createdAt: auditLogs.createdAt, id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.id, query.before));
    if (cursor) {
      filters.push(
        or(
          lt(auditLogs.createdAt, cursor.createdAt),
          and(
            eq(auditLogs.createdAt, cursor.createdAt),
            lt(auditLogs.id, cursor.id)
          )
        ) as SQL
      );
    }
  }

  const rows = await db
    .select()
    .from(auditLogs)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit + 1);

  const entries = rows.slice(0, limit);
  return {
    entries,
    nextBefore: rows.length > limit ? (entries.at(-1)?.id ?? null) : null,
  };
}
