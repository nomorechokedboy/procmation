/**
 * lib/bpma/types.ts
 * Shared TypeScript types for BPMA API responses.
 * Import these in both API routes and the frontend client.
 */

// ─── Processes ───────────────────────────────

export type ProcessStatus = "draft" | "active" | "archived";

export type ProcessDefinition = {
  id: string;
  slug: string;
  version: number;
  name: string;
  description: string | null;
  nodes: unknown[];
  edges: unknown[];
  status: ProcessStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Cases ───────────────────────────────────

export type CaseStatus =
  | "open"
  | "in_progress"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export type CasePriority = "low" | "medium" | "high" | "urgent";

export type Case = {
  id: string;
  caseNumber: string;
  processDefinitionId: string;
  processInstanceId: string | null;
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  initiatorId: string;
  participants: string[];
  metadata: Record<string, unknown>;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TimelineEventType =
  | "case_created"
  | "case_updated"
  | "task_created"
  | "task_completed"
  | "task_reassigned"
  | "status_changed"
  | "comment_added"
  | "form_submitted"
  | "escalation_triggered";

export type CaseTimelineEntry = {
  id: string;
  caseId: string;
  eventType: TimelineEventType;
  actorId: string | null;
  nodeId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
};

export type CaseDetail = {
  case: Case;
  timeline: CaseTimelineEntry[];
  tasks: Task[];
};

// ─── Tasks ───────────────────────────────────

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "escalated";

export type Task = {
  id: string;
  caseId: string;
  processInstanceId: string;
  nodeId: string;
  stepLabel: string;
  assigneeId: string | null;
  status: TaskStatus;
  formId: string | null;
  formSubmissionId: string | null;
  outcome: Record<string, unknown> | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Notifications ────────────────────────────

export type NotificationType =
  | "task_assigned"
  | "task_due_soon"
  | "task_overdue"
  | "case_updated"
  | "case_completed"
  | "escalation";

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  caseId: string | null;
  taskId: string | null;
  createdAt: string;
};

export type NotificationsResponse = {
  notifications: Notification[];
  unreadCount: number;
};

// ─── Departments ─────────────────────────────

export type Department = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};
