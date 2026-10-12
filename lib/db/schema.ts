import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { IntegrationType } from "../types/integration";
import type { FormField } from "../types/process-form";
import { generateId } from "../utils/id";

export type UserRole = "admin" | "member";

// Better Auth tables
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // Anonymous user tracking (legacy column, anonymous sign-in is disabled)
  isAnonymous: boolean("is_anonymous").default(false),
  role: text("role").$type<UserRole>().notNull().default("member"),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// Invite-only sign-up: an admin creates an invitation, the invitee accepts it once
export const invitations = pgTable("invitations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  email: text("email").notNull(),
  role: text("role").$type<UserRole>().notNull().default("member"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Workflow visibility type
export type WorkflowVisibility = "private" | "public";

// Workflows table with user association
export const workflows = pgTable("workflows", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  description: text("description"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  nodes: jsonb("nodes").notNull().$type<any[]>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  edges: jsonb("edges").notNull().$type<any[]>(),
  visibility: text("visibility")
    .notNull()
    .default("private")
    .$type<WorkflowVisibility>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Integrations table for storing user credentials
export const integrations = pgTable("integrations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  type: text("type").notNull().$type<IntegrationType>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - encrypted credentials stored as JSON
  config: jsonb("config").notNull().$type<any>(),
  // Whether this integration was created via OAuth (managed by app) vs manual entry
  isManaged: boolean("is_managed").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Workflow executions table to track workflow runs
export const workflowExecutions = pgTable("workflow_executions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => workflows.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  status: text("status")
    .notNull()
    .$type<"pending" | "running" | "success" | "error" | "cancelled">(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  input: jsonb("input").$type<Record<string, any>>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  output: jsonb("output").$type<any>(),
  error: text("error"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  duration: text("duration"), // Duration in milliseconds
});

// Workflow execution logs to track individual node executions
export const workflowExecutionLogs = pgTable("workflow_execution_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  executionId: text("execution_id")
    .notNull()
    .references(() => workflowExecutions.id),
  nodeId: text("node_id").notNull(),
  nodeName: text("node_name").notNull(),
  nodeType: text("node_type").notNull(),
  status: text("status")
    .notNull()
    .$type<"pending" | "running" | "success" | "error">(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  input: jsonb("input").$type<any>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  output: jsonb("output").$type<any>(),
  error: text("error"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  duration: text("duration"), // Duration in milliseconds
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// API Keys table for webhook authentication
export const apiKeys = pgTable("api_keys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name"), // Optional label for the API key
  keyHash: text("key_hash").notNull(), // Store hashed version of the key
  keyPrefix: text("key_prefix").notNull(), // Store first few chars for display (e.g., "wf_abc...")
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
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
export type CaseStatus = "open" | "closed";

export const departments = pgTable("departments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull().unique(),
  parentId: text("parent_id").references((): AnyPgColumn => departments.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Org context for a user: which department they are in and who their manager is
export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  departmentId: text("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  managerId: text("manager_id").references(() => users.id, {
    onDelete: "set null",
  }),
  jobTitle: text("job_title"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Reusable form library. The prototype keeps forms inline on definitions and
// tasks, so nothing writes here yet.
export const forms = pgTable("forms", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  description: text("description"),
  fields: jsonb("fields").notNull().$type<FormField[]>().default([]),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Not used by the prototype: long-lived records that group several instances
export const cases = pgTable("cases", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  title: text("title").notNull(),
  status: text("status").notNull().default("open").$type<CaseStatus>(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  departmentId: text("department_id").references(() => departments.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const caseTimeline = pgTable(
  "case_timeline",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id),
    kind: text("kind").notNull(),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - shape depends on kind
    data: jsonb("data").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("case_timeline_case_idx").on(table.caseId)]
);

// A published, startable process. The graph itself lives in the linked workflow.
export const processDefinitions = pgTable(
  "process_definitions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workflowId: text("workflow_id")
      .notNull()
      .unique()
      .references(() => workflows.id),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<ProcessDefinitionStatus>(),
    version: integer("version").notNull().default(1),
    category: text("category"),
    // Fields the requester fills in to start the process
    startFormFields: jsonb("start_form_fields")
      .notNull()
      .$type<FormField[]>()
      .default([]),
    departmentId: text("department_id").references(() => departments.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("process_definitions_status_idx").on(table.status)]
);

// One run of a process for one requester
export const processInstances = pgTable(
  "process_instances",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    definitionId: text("definition_id")
      .notNull()
      .references(() => processDefinitions.id),
    // Link to the execution record that holds per-node logs for the Runs UI
    workflowExecutionId: text("workflow_execution_id")
      .unique()
      .references(() => workflowExecutions.id),
    // Workflow DevKit run id, used to look up and resume the suspended run
    runId: text("run_id").unique(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id),
    caseId: text("case_id").references(() => cases.id),
    status: text("status")
      .notNull()
      .default("running")
      .$type<ProcessInstanceStatus>(),
    // Final result chosen by the process, for example "approved" or "rejected"
    outcome: text("outcome"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
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
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    instanceId: text("instance_id")
      .notNull()
      .references(() => processInstances.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    name: text("name").notNull(),
    // A task is assigned to a person, to a department pool, or both
    assigneeId: text("assignee_id").references(() => users.id),
    assigneeDepartmentId: text("assignee_department_id").references(
      () => departments.id
    ),
    // Fields the assignee fills in when completing the task
    formFields: jsonb("form_fields")
      .notNull()
      .$type<FormField[]>()
      .default([]),
    status: text("status").notNull().default("pending").$type<TaskStatus>(),
    // The branch the assignee chose, for example "approve" or "reject"
    outcome: text("outcome"),
    completedById: text("completed_by_id").references(() => users.id),
    completedAt: timestamp("completed_at"),
    dueAt: timestamp("due_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
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

// Values someone submitted: the start form (no task) or a task form
export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    formId: text("form_id").references(() => forms.id),
    instanceId: text("instance_id")
      .notNull()
      .references(() => processInstances.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    submittedById: text("submitted_by_id")
      .notNull()
      .references(() => users.id),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("form_submissions_instance_idx").on(table.instanceId)]
);

// Not used by the prototype (email only): in-app notifications
export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("notifications_user_read_idx").on(table.userId, table.readAt)]
);

// Not used by the prototype: deadlines that remind or escalate on a task
export const slaEscalations = pgTable(
  "sla_escalations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().$type<"reminder" | "escalate" | "reassign">(),
    dueAt: timestamp("due_at").notNull(),
    escalateToId: text("escalate_to_id").references(() => users.id),
    firedAt: timestamp("fired_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("sla_escalations_due_idx").on(table.dueAt, table.firedAt)]
);

// Ready-made processes a user can start from, such as the leave request
export const processTemplates = pgTable("process_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  nodes: jsonb("nodes").notNull().$type<any[]>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  edges: jsonb("edges").notNull().$type<any[]>(),
  startFormFields: jsonb("start_form_fields")
    .notNull()
    .$type<FormField[]>()
    .default([]),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
export type ProcessDefinition = typeof processDefinitions.$inferSelect;
export type NewProcessDefinition = typeof processDefinitions.$inferInsert;
export type ProcessInstance = typeof processInstances.$inferSelect;
export type NewProcessInstance = typeof processInstances.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type ProcessTemplate = typeof processTemplates.$inferSelect;
