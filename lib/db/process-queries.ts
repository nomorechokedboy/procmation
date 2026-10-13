import { processDefinitions, workflows } from "@/lib/db/schema";

// What the API returns for a process: the definition plus the name and
// description that live on its workflow
export const processSummarySelection = {
  id: processDefinitions.id,
  workflowId: processDefinitions.workflowId,
  name: workflows.name,
  description: workflows.description,
  status: processDefinitions.status,
  version: processDefinitions.version,
  category: processDefinitions.category,
  startFormFields: processDefinitions.startFormFields,
  publishedAt: processDefinitions.publishedAt,
  updatedAt: processDefinitions.updatedAt,
};
