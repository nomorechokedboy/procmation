import { processDefinitions, workflows } from "@/lib/db/schema";

// What the API returns for a process: the definition plus the name and
// description that live on its workflow
export const processSummarySelection = {
  category: processDefinitions.category,
  description: workflows.description,
  id: processDefinitions.id,
  name: workflows.name,
  publishedAt: processDefinitions.publishedAt,
  startFormFields: processDefinitions.startFormFields,
  status: processDefinitions.status,
  updatedAt: processDefinitions.updatedAt,
  version: processDefinitions.version,
  workflowId: processDefinitions.workflowId,
};
