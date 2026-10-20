import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { TaskOutcome } from "../types/human-task";
import type { IntegrationType } from "../types/integration";
import type { FormField } from "../types/process-form";
import { generateId } from "../utils/id";

// The key of a row in `roles`: "admin", "member" or a role an admin made
export type UserRole = string;

// Named sets of permissions (see lib/permissions.ts). A user holds one role.
export const roles = pgTable("roles", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  description: text("description"),
  // The built-in roles, "admin" and "member", cannot be edited or deleted
  isSystem: boolean("is_system").notNull().default(false),
  key: text("key").primaryKey(),
  name: text("name").notNull().unique(),
  permissions: jsonb("permissions").notNull().$type<string[]>().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Better Auth tables
export const users = pgTable("users", {
  createdAt: timestamp("created_at").notNull(),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  id: text("id").primaryKey(),
  image: text("image"),
  // Anonymous user tracking (legacy column, anonymous sign-in is disabled)
  isAnonymous: boolean("is_anonymous").default(false),
  name: text("name"),
  role: text("role")
    .$type<UserRole>()
    .notNull()
    .default("member")
    .references(() => roles.key),
  updatedAt: timestamp("updated_at").notNull(),
});

export const sessions = pgTable("sessions", {
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  id: text("id").primaryKey(),
  ipAddress: text("ip_address"),
  token: text("token").notNull().unique(),
  updatedAt: timestamp("updated_at").notNull(),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
});

export const accounts = pgTable("accounts", {
  accessToken: text("access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  accountId: text("account_id").notNull(),
  createdAt: timestamp("created_at").notNull(),
  id: text("id").primaryKey(),
  idToken: text("id_token"),
  password: text("password"),
  providerId: text("provider_id").notNull(),
  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  updatedAt: timestamp("updated_at").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
});

export const verifications = pgTable("verifications", {
  createdAt: timestamp("created_at"),
  expiresAt: timestamp("expires_at").notNull(),
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  updatedAt: timestamp("updated_at"),
  value: text("value").notNull(),
});

// Invite-only sign-up: an admin creates an invitation, the invitee accepts it once
export const invitations = pgTable("invitations", {
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id),
  role: text("role")
    .$type<UserRole>()
    .notNull()
    .default("member")
    .references(() => roles.key),
  tokenHash: text("token_hash").notNull().unique(),
});

// Workflow visibility type
export type WorkflowVisibility = "private" | "public";

// Workflows table with user association
export const workflows = pgTable("workflows", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  description: text("description"),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  edges: jsonb("edges").notNull().$type<any[]>(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  nodes: jsonb("nodes").notNull().$type<any[]>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  visibility: text("visibility")
    .notNull()
    .default("private")
    .$type<WorkflowVisibility>(),
});

// Integrations table for storing user credentials
export const integrations = pgTable("integrations", {
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - encrypted credentials stored as JSON
  config: jsonb("config").notNull().$type<any>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  // Whether this integration was created via OAuth (managed by app) vs manual entry
  isManaged: boolean("is_managed").default(false),
  name: text("name").notNull(),
  type: text("type").notNull().$type<IntegrationType>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
});

// Workflow executions table to track workflow runs
export const workflowExecutions = pgTable("workflow_executions", {
  completedAt: timestamp("completed_at"),
  duration: text("duration"), // Duration in milliseconds
  error: text("error"),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  input: jsonb("input").$type<Record<string, any>>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  output: jsonb("output").$type<any>(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  status: text("status")
    .notNull()
    .$type<"pending" | "running" | "success" | "error" | "cancelled">(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => workflows.id),
});

// Workflow execution logs to track individual node executions
export const workflowExecutionLogs = pgTable("workflow_execution_logs", {
  completedAt: timestamp("completed_at"),
  duration: text("duration"), // Duration in milliseconds
  error: text("error"),
  executionId: text("execution_id")
    .notNull()
    .references(() => workflowExecutions.id),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  input: jsonb("input").$type<any>(),
  nodeId: text("node_id").notNull(),
  nodeName: text("node_name").notNull(),
  nodeType: text("node_type").notNull(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  output: jsonb("output").$type<any>(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  status: text("status")
    .notNull()
    .$type<"pending" | "running" | "success" | "error">(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// API Keys table for webhook authentication
export const apiKeys = pgTable("api_keys", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  keyHash: text("key_hash").notNull(), // Store hashed version of the key
  keyPrefix: text("key_prefix").notNull(), // Store first few chars for display (e.g., "wf_abc...")
  lastUsedAt: timestamp("last_used_at"),
  name: text("name"), // Optional label for the API key
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
});

// ---------------------------------------------------------------------------
// Business process management
//
// A process definition is a published workflow: the canvas graph keeps living
// in `workflows`, and a run of it is tracked in `workflow_executions` with
// per-node history in `workflow_execution_logs`. The tables below add what a
// process needs on top: who started it, who has to act, and what they submitted.
// ---------------------------------------------------------------------------

export type ProcessDefinitionStatus = "draft" | "published" | "archived";
export type ProcessInstanceStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";
export type TaskStatus = "pending" | "completed" | "cancelled";
export type CaseStatus =
  | "open"
  | "in_progress"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed"
  | "cancelled";
export type CasePriority = "low" | "medium" | "high" | "urgent";
export type TimelineEventType =
  | "case_created"
  | "case_updated"
  | "task_created"
  | "task_completed"
  | "task_reassigned"
  | "task_claimed"
  | "task_released"
  | "status_changed"
  | "comment_added"
  | "form_submitted"
  | "escalation_triggered"
  | "task_escalated";
export type NotificationType =
  | "task_assigned"
  | "task_due_soon"
  | "task_overdue"
  | "case_updated"
  | "case_completed"
  | "case_failed"
  | "case_cancelled"
  | "escalation";

export const departments = pgTable("departments", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull().unique(),
  parentId: text("parent_id").references((): AnyPgColumn => departments.id, {
    onDelete: "set null",
  }),
});

// Org context for a user: which department they are in and who their manager is
export const userProfiles = pgTable("user_profiles", {
  departmentId: text("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  jobTitle: text("job_title"),
  managerId: text("manager_id").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
});

// Reusable form library. The prototype keeps forms inline on definitions and
// tasks, so nothing writes here yet.
export const forms = pgTable("forms", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  description: text("description"),
  fields: jsonb("fields").notNull().$type<FormField[]>().default([]),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A published, startable process. The graph itself lives in the linked workflow.
export const processDefinitions = pgTable(
  "process_definitions",
  {
    category: text("category"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    departmentId: text("department_id").references(() => departments.id),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    publishedAt: timestamp("published_at"),
    // Fields the requester fills in to start the process
    startFormFields: jsonb("start_form_fields")
      .notNull()
      .$type<FormField[]>()
      .default([]),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<ProcessDefinitionStatus>(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    workflowId: text("workflow_id")
      .notNull()
      .unique()
      .references(() => workflows.id),
  },
  (table) => [index("process_definitions_status_idx").on(table.status)]
);

// One run of a process for one requester
export const processInstances = pgTable(
  "process_instances",
  {
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    definitionId: text("definition_id")
      .notNull()
      .references(() => processDefinitions.id),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    // Final result chosen by the process, for example "approved" or "rejected"
    outcome: text("outcome"),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id),
    // Workflow DevKit run id, used to look up and resume the suspended run
    runId: text("run_id").unique(),
    status: text("status")
      .notNull()
      .default("running")
      .$type<ProcessInstanceStatus>(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // Link to the execution record that holds per-node logs for the Runs UI
    workflowExecutionId: text("workflow_execution_id").unique(),
  },
  (table) => [
    // Named explicitly: the generated name is longer than Postgres' 63
    // character identifier limit and would be silently truncated
    foreignKey({
      columns: [table.workflowExecutionId],
      foreignColumns: [workflowExecutions.id],
      name: "process_instances_execution_fk",
    }),
    index("process_instances_requester_idx").on(table.requesterId),
    index("process_instances_definition_status_idx").on(
      table.definitionId,
      table.status
    ),
  ]
);

// A human task: a running instance suspends here until someone completes it.
// The resume token is derived as `task:<instanceId>:<nodeId>`, so no token is
// stored and the unique index below guarantees one task per node per instance.
export const tasks = pgTable(
  "tasks",
  {
    assigneeDepartmentId: text("assignee_department_id").references(
      () => departments.id
    ),
    // A task is assigned to a person, to a department pool, or both
    assigneeId: text("assignee_id").references(() => users.id),
    completedAt: timestamp("completed_at"),
    completedById: text("completed_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    dueAt: timestamp("due_at"),
    // Set once when the assignee is reminded and once when the manager is told
    escalatedAt: timestamp("escalated_at"),
    escalatedToId: text("escalated_to_id").references(() => users.id),
    // Fields the assignee fills in when completing the task
    formFields: jsonb("form_fields").notNull().$type<FormField[]>().default([]),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    instanceId: text("instance_id")
      .notNull()
      .references(() => processInstances.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nodeId: text("node_id").notNull(),
    // The branch the assignee chose, for example "approve" or "reject"
    outcome: text("outcome"),
    // The choices the assignee can pick from; empty means no choice is needed
    outcomes: jsonb("outcomes").notNull().$type<TaskOutcome[]>().default([]),
    remindedAt: timestamp("reminded_at"),
    status: text("status").notNull().default("pending").$type<TaskStatus>(),
  },
  (table) => [
    uniqueIndex("tasks_instance_node_idx").on(table.instanceId, table.nodeId),
    index("tasks_assignee_status_idx").on(table.assigneeId, table.status),
    index("tasks_department_status_idx").on(
      table.assigneeDepartmentId,
      table.status
    ),
    check(
      "tasks_has_assignee",
      sql`${table.assigneeId} is not null or ${table.assigneeDepartmentId} is not null`
    ),
  ]
);

// A case is the human-facing record of one request: it has a readable number,
// an initiator, a priority and a timeline. It points at the process instance
// that executes it, once one exists.
export const caseNumberSeq = pgSequence("case_number_seq");

export const cases = pgTable(
  "cases",
  {
    // Human-readable number such as CASE-2026-00042
    caseNumber: text("case_number").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    dueAt: timestamp("due_at"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    initiatorId: text("initiator_id")
      .notNull()
      .references(() => users.id),
    metadata: jsonb("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    participants: jsonb("participants").notNull().$type<string[]>().default([]),
    priority: text("priority")
      .notNull()
      .default("medium")
      .$type<CasePriority>(),
    processDefinitionId: text("process_definition_id")
      .notNull()
      .references(() => processDefinitions.id),
    processInstanceId: text("process_instance_id").references(
      () => processInstances.id,
      { onDelete: "set null" }
    ),
    status: text("status").notNull().default("open").$type<CaseStatus>(),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("cases_initiator_idx").on(table.initiatorId),
    index("cases_status_idx").on(table.status),
    uniqueIndex("cases_instance_idx").on(table.processInstanceId),
  ]
);

export const caseTimeline = pgTable(
  "case_timeline",
  {
    actorId: text("actor_id").references(() => users.id),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>().default({}),
    eventType: text("event_type").notNull().$type<TimelineEventType>(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    // Which workflow node produced the event
    nodeId: text("node_id"),
  },
  (table) => [index("case_timeline_case_idx").on(table.caseId)]
);

// Values someone submitted: the start form (no task) or a task form
export const formSubmissions = pgTable(
  "form_submissions",
  {
    createdAt: timestamp("created_at").notNull().defaultNow(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    formId: text("form_id").references(() => forms.id),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    instanceId: text("instance_id")
      .notNull()
      .references(() => processInstances.id, { onDelete: "cascade" }),
    submittedById: text("submitted_by_id")
      .notNull()
      .references(() => users.id),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  },
  (table) => [index("form_submissions_instance_idx").on(table.instanceId)]
);

// In-app notifications for a user
export const notifications = pgTable(
  "notifications",
  {
    body: text("body").notNull(),
    caseId: text("case_id").references(() => cases.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>().default({}),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    read: boolean("read").notNull().default(false),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: text("type").notNull().$type<NotificationType>(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("notifications_user_read_idx").on(table.userId, table.read)]
);

// One append-only log for every kind of resource. Adding a new resource means
// choosing a resourceType and action names, not creating another table.
// Actor and label columns are snapshots, so the log stays readable after the
// person or record they name is renamed or deleted; for that reason they are
// plain text and not foreign keys.
export const auditLogs = pgTable(
  "audit_logs",
  {
    action: text("action").notNull(),
    // Null when the system acted, for example a deadline escalation
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    // The record this one belongs to, such as the case of a task
    parentId: text("parent_id"),
    parentLabel: text("parent_label"),
    parentType: text("parent_type"),
    resourceId: text("resource_id"),
    // A readable name, such as a case number or a member's name
    resourceLabel: text("resource_label"),
    resourceType: text("resource_type").notNull(),
    summary: text("summary").notNull(),
  },
  (table) => [
    index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
    index("audit_logs_parent_idx").on(table.parentType, table.parentId),
    index("audit_logs_actor_idx").on(table.actorId),
    index("audit_logs_created_idx").on(table.createdAt),
  ]
);

// Not used by the prototype: deadlines that remind or escalate on a task
export const slaEscalations = pgTable(
  "sla_escalations",
  {
    createdAt: timestamp("created_at").notNull().defaultNow(),
    dueAt: timestamp("due_at").notNull(),
    escalateToId: text("escalate_to_id").references(() => users.id),
    firedAt: timestamp("fired_at"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    kind: text("kind").notNull().$type<"reminder" | "escalate" | "reassign">(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (table) => [index("sla_escalations_due_idx").on(table.dueAt, table.firedAt)]
);

// Ready-made processes a user can start from, such as the leave request
export const processTemplates = pgTable("process_templates", {
  category: text("category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").references(() => users.id),
  description: text("description"),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  edges: jsonb("edges").notNull().$type<any[]>(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  name: text("name").notNull(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  nodes: jsonb("nodes").notNull().$type<any[]>(),
  startFormFields: jsonb("start_form_fields")
    .notNull()
    .$type<FormField[]>()
    .default([]),
});

// Relations
export const workflowExecutionsRelations = relations(
  workflowExecutions,
  ({ one }) => ({
    workflow: one(workflows, {
      fields: [workflowExecutions.workflowId],
      references: [workflows.id],
    }),
  })
);

export type Invitation = typeof invitations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;
export type WorkflowExecutionLog = typeof workflowExecutionLogs.$inferSelect;
export type NewWorkflowExecutionLog = typeof workflowExecutionLogs.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type Form = typeof forms.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type CaseTimelineEntry = typeof caseTimeline.$inferSelect;
export type ProcessDefinition = typeof processDefinitions.$inferSelect;
export type NewProcessDefinition = typeof processDefinitions.$inferInsert;
export type ProcessInstance = typeof processInstances.$inferSelect;
export type NewProcessInstance = typeof processInstances.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type ProcessTemplate = typeof processTemplates.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type Role = typeof roles.$inferSelect;
