import "server-only";

import { type AnyColumn, and, desc, eq, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import {
  processDefinitions,
  processVersions,
  workflows,
} from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MAX_VERSION_NOTE_LENGTH = 200;

// SQL that is true when the draft (workflow and start form) differs from the
// published version `pv`, or when there is no published version at all
type VersionColumns = Record<
  "id" | "nodes" | "edges" | "name" | "description" | "startFormFields",
  AnyColumn
>;

export function draftDiffersSql(pv: VersionColumns) {
  return sql<boolean>`(
    ${pv.id} IS NULL
    OR ${pv.nodes} IS DISTINCT FROM ${workflows.nodes}
    OR ${pv.edges} IS DISTINCT FROM ${workflows.edges}
    OR ${pv.name} IS DISTINCT FROM ${workflows.name}
    OR ${pv.description} IS DISTINCT FROM ${workflows.description}
    OR ${pv.startFormFields} IS DISTINCT FROM ${processDefinitions.startFormFields}
  )`;
}

export async function latestVersion(tx: Tx, definitionId: string) {
  const [row] = await tx
    .select()
    .from(processVersions)
    .where(eq(processVersions.definitionId, definitionId))
    .orderBy(desc(processVersions.version))
    .limit(1);
  return row;
}

// Copies the draft into a new version when it differs from the latest one and
// returns that version either way. Run inside the transaction that flips the
// process to published so a failure leaves neither half behind.
export async function publishDraft(
  tx: Tx,
  input: { definitionId: string; userId: string; note?: string | null }
): Promise<{ version: number; created: boolean }> {
  const [draft] = await tx
    .select({
      description: workflows.description,
      edges: workflows.edges,
      name: workflows.name,
      nodes: workflows.nodes,
      startFormFields: processDefinitions.startFormFields,
    })
    .from(processDefinitions)
    .innerJoin(workflows, eq(processDefinitions.workflowId, workflows.id))
    .where(eq(processDefinitions.id, input.definitionId))
    // Two people publishing at once take turns, so version numbers never clash
    .for("update", { of: processDefinitions });

  const latest = await latestVersion(tx, input.definitionId);
  const same =
    latest &&
    JSON.stringify([
      latest.nodes,
      latest.edges,
      latest.name,
      latest.description,
      latest.startFormFields,
    ]) ===
      JSON.stringify([
        draft.nodes,
        draft.edges,
        draft.name,
        draft.description,
        draft.startFormFields,
      ]);
  if (latest && same) {
    return { created: false, version: latest.version };
  }

  const version = (latest?.version ?? 0) + 1;
  await tx.insert(processVersions).values({
    ...draft,
    definitionId: input.definitionId,
    note: input.note ?? null,
    publishedById: input.userId,
    version,
  });
  await tx
    .update(processDefinitions)
    .set({ version })
    .where(and(eq(processDefinitions.id, input.definitionId)));
  return { created: true, version };
}
