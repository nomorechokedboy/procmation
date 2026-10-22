import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  processDefinitions,
  processVersions,
  workflows,
} from "@/lib/db/schema";
import { draftDiffersSql } from "@/lib/process-versions";

// The version cases start from: the latest published one
export const currentVersion = alias(processVersions, "current_version");

// What the API returns for a process: the definition plus the name and
// description that live on its workflow. `startFormFields` is the draft the
// editor works on; `publishedStartFormFields` is what a new case is asked.
export const processSummarySelection = {
  category: processDefinitions.category,
  description: workflows.description,
  hasUnpublishedChanges: draftDiffersSql(currentVersion),
  id: processDefinitions.id,
  name: workflows.name,
  publishedAt: processDefinitions.publishedAt,
  publishedStartFormFields: currentVersion.startFormFields,
  startFormFields: processDefinitions.startFormFields,
  status: processDefinitions.status,
  updatedAt: processDefinitions.updatedAt,
  version: processDefinitions.version,
  workflowId: processDefinitions.workflowId,
};

// Join that attaches the latest version to a process row
export function currentVersionJoin() {
  return and(
    eq(currentVersion.definitionId, processDefinitions.id),
    eq(currentVersion.version, processDefinitions.version)
  );
}
