import "server-only";

import { and, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db";
import { type AuditLog, auditLogs, type NewAuditLog } from "@/lib/db/schema";

// Resource types written so far. The column is free text, so a new kind of
// resource needs no migration: pick a name and start writing.
export const AUDIT_RESOURCES = {
  case: "case",
  comment: "comment",
  delegation: "delegation",
  department: "department",
  invite: "invite",
  member: "member",
  process: "process",
  role: "role",
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

export function userActor(user: { id: string; name: string; email: string }) {
  return { id: user.id, name: user.name || user.email } satisfies AuditActor;
}

function toRow(entry: AuditEntry): NewAuditLog {
  const actor = entry.actor === "system" ? null : entry.actor;
  return {
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
  };
}

// Inside a request, ask Next.js to keep the work going after the response
// (serverless hosts may otherwise stop it). Outside a request, such as in a
// workflow step, the write just carries on in the background.
function keepAlive(work: Promise<unknown>) {
  try {
    after(work);
  } catch {
    // not in a request scope
  }
}

// Writes entries without making the caller wait: the action that caused them
// never slows down or fails because of the log. Call it after the change is
// committed, never inside its transaction, so a rolled-back change leaves no
// entry. A failed write is logged with what it said, so it can be recovered.
export function recordAudit(entries: AuditEntry | AuditEntry[]): void {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) {
    return;
  }
  const write = db
    .insert(auditLogs)
    .values(list.map(toRow))
    .catch((error: unknown) => {
      console.error(
        "[audit] could not write entries:",
        list.map((entry) => entry.summary),
        error instanceof Error ? error.message : error
      );
    });
  keepAlive(write);
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
