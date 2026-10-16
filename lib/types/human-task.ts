import type { FormField } from "./process-form";

// A choice the assignee can make, and the edge handle it leaves the node by
export type TaskOutcome = {
  id: string;
  label: string;
};

export type AssigneeType = "user" | "department" | "manager";

// Config stored on a "Human Task" node of a workflow
export type HumanTaskConfig = {
  taskName?: string;
  assigneeType?: AssigneeType;
  // assigneeType "user": a specific person
  assigneeUserId?: string;
  // assigneeType "department": anyone in the department can pick it up
  assigneeDepartmentId?: string;
  formFields?: FormField[];
  outcomes?: TaskOutcome[];
};

export const DEFAULT_TASK_OUTCOMES: TaskOutcome[] = [
  { id: "approve", label: "Approve" },
  { id: "reject", label: "Reject" },
];

export const HUMAN_TASK_ACTION = "Human Task";
export const CONDITION_ACTION = "Condition";

// What a Human Task node hands to the nodes after it
export type HumanTaskDecision = {
  outcome: string;
  values: Record<string, unknown>;
  by: string;
};
