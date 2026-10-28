import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { processDefinitions, processVersions } from "@/lib/db/schema";
import type { FormField } from "@/lib/types/process-form";

export type StartableProcess = {
  startFormFields: FormField[];
  versionId: string;
  workflowId: string;
};

// What a new case of a process starts from: the latest published version,
// never the draft. Says why not when the process cannot be started.
export async function findStartableProcess(
  definitionId: string
): Promise<
  | { ok: true; process: StartableProcess }
  | { ok: false; reason: "not_found" | "not_published" }
> {
  const [definition] = await db
    .select({
      startFormFields: processVersions.startFormFields,
      status: processDefinitions.status,
      versionId: processVersions.id,
      workflowId: processDefinitions.workflowId,
    })
    .from(processDefinitions)
    .leftJoin(
      processVersions,
      and(
        eq(processVersions.definitionId, processDefinitions.id),
        eq(processVersions.version, processDefinitions.version)
      )
    )
    .where(eq(processDefinitions.id, definitionId));
  if (!definition) {
    return { ok: false, reason: "not_found" };
  }
  if (definition.status !== "published" || !definition.versionId) {
    return { ok: false, reason: "not_published" };
  }
  return {
    ok: true,
    process: {
      startFormFields: definition.startFormFields ?? [],
      versionId: definition.versionId,
      workflowId: definition.workflowId,
    },
  };
}
