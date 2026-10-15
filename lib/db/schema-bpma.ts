/**
 * BPMA Schema Extension
 * Appended to lib/db/schema.ts
 * Phase 0 - All tables for all phases defined upfront
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { generateId } from "../utils/id";
import { users } from "./schema";

// ─────────────────────────────────────────────
// PHASE 1: Org Structure
// ─────────────────────────────────────────────

export const departments = pgTable("departments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  parentId: text("parent_id"), // self-reference for hierarchy
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  departmentId: text("department_id").references(() => departments.id),
  managerId: text("manager_id"), // references users.id
  role: text("role").notNull().default("user"), // 'admin' | 'manager' | 'user'
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// PHASE 2: Process Designer
// ─────────────────────────────────────────────

export type ProcessStatus = "draft" | "active" | "archived";

export const processDefinitions = pgTable("process_definitions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  slug: text("slug").notNull(), // e.g. "leave-request"
  version: integer("version").notNull().default(1),
  name: text("name").notNull(),
  description: text("description"),
  // React Flow graph stored as JSON (nodes + edges)
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  nodes: jsonb("nodes").notNull().$type<any[]>().default([]),
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  edges: jsonb("edges").notNull().$type<any[]>().default([]),
  status: text("status").notNull().default("draft").$type<ProcessStatus>(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Individual step configuration (mirrors nodes but enriched for BPMA)
export type AssignmentRule = {
  type:
    | "static_user"
    | "role"
    | "department"
    | "manager_of_initiator"
    | "round_robin";
  value?: string; // userId / role name / department id
};

export type GatewayCondition = {
  field: string; // form field key
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=";
  value: unknown;
  targetNodeId: string;
};

export const processSteps = pgTable("process_steps", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  processDefinitionId: text("process_definition_id")
    .notNull()
    .references(() => processDefinitions.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(), // matches the React Flow node id
  type: text("type").notNull(), // 'start' | 'human_task' | 'automated' | 'gateway' | 'end'
  label: text("label").notNull(),
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  assignmentRule: jsonb("assignment_rule").$type<AssignmentRule>(),
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  gatewayRules: jsonb("gateway_rules").$type<GatewayCondition[]>(),
  formId: text("form_id"), // references forms.id (set after Phase 4 forms table exists)
  slaHours: integer("sla_hours"), // null = no SLA
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// PHASE 4: Forms
// ─────────────────────────────────────────────

export type FormFieldSchema = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "checkbox" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
};

export const forms = pgTable("forms", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  schema: jsonb("schema").notNull().$type<FormFieldSchema[]>().default([]),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const formSubmissions = pgTable("form_submissions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  formId: text("form_id")
    .notNull()
    .references(() => forms.id),
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  data: jsonb("data").notNull().$type<Record<string, unknown>>().default({}),
  submittedBy: text("submitted_by")
    .notNull()
    .references(() => users.id),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// PHASE 3: Cases & Task Engine
// ─────────────────────────────────────────────

export type CaseStatus =
  | "open"
  | "in_progress"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export type CasePriority = "low" | "medium" | "high" | "urgent";

export const processInstances = pgTable("process_instances", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  processDefinitionId: text("process_definition_id")
    .notNull()
    .references(() => processDefinitions.id),
  // Pin instance to the version that was active when it started
  processDefinitionVersion: integer("process_definition_version").notNull(),
  status: text("status")
    .notNull()
    .default("running")
    .$type<"running" | "completed" | "error" | "cancelled">(),
  currentNodeId: text("current_node_id"),
  // Runtime context: form data, variable values, etc.
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  contextData: jsonb("context_data").$type<Record<string, unknown>>().default({}),
  startedBy: text("started_by")
    .notNull()
    .references(() => users.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const cases = pgTable("cases", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  // Human-readable case number: CASE-2025-0001
  caseNumber: text("case_number").notNull().unique(),
  processDefinitionId: text("process_definition_id")
    .notNull()
    .references(() => processDefinitions.id),
  processInstanceId: text("process_instance_id").references(
    () => processInstances.id
  ),
  title: text("title").notNull(),
  status: text("status")
    .notNull()
    .default("open")
    .$type<CaseStatus>(),
  priority: text("priority")
    .notNull()
    .default("medium")
    .$type<CasePriority>(),
  initiatorId: text("initiator_id")
    .notNull()
    .references(() => users.id),
  // JSON array of userId strings
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  participants: jsonb("participants").$type<string[]>().default([]),
  // Arbitrary metadata
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  dueAt: timestamp("due_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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

export const caseTimeline = pgTable("case_timeline", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull().$type<TimelineEventType>(),
  actorId: text("actor_id").references(() => users.id),
  nodeId: text("node_id"), // which step triggered the event
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  data: jsonb("data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped" | "escalated";

export const tasks = pgTable("tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  processInstanceId: text("process_instance_id")
    .notNull()
    .references(() => processInstances.id),
  nodeId: text("node_id").notNull(), // step node id
  stepLabel: text("step_label").notNull(),
  assigneeId: text("assignee_id").references(() => users.id),
  status: text("status")
    .notNull()
    .default("pending")
    .$type<TaskStatus>(),
  formId: text("form_id").references(() => forms.id),
  formSubmissionId: text("form_submission_id").references(
    () => formSubmissions.id
  ),
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  outcome: jsonb("outcome").$type<Record<string, unknown>>(), // result / decision data
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// PHASE 3: Notifications & SLA
// ─────────────────────────────────────────────

export type NotificationType =
  | "task_assigned"
  | "task_due_soon"
  | "task_overdue"
  | "case_updated"
  | "case_completed"
  | "escalation";

export const notifications = pgTable("notifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull().$type<NotificationType>(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  data: jsonb("data").$type<Record<string, unknown>>().default({}),
  read: boolean("read").notNull().default(false),
  caseId: text("case_id").references(() => cases.id),
  taskId: text("task_id").references(() => tasks.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const slaEscalations = pgTable("sla_escalations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id),
  escalatedTo: text("escalated_to").references(() => users.id), // manager
  reason: text("reason").notNull(),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// ─────────────────────────────────────────────
// PROCESS TEMPLATES (Phase 2 extras)
// ─────────────────────────────────────────────

export const processTemplates = pgTable("process_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // 'HR' | 'Finance' | 'IT' | ...
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  nodes: jsonb("nodes").notNull().$type<any[]>().default([]),
  // biome-ignore lint/suspicious/noExplicitAny: jsonb
  edges: jsonb("edges").notNull().$type<any[]>().default([]),
  isPublic: boolean("is_public").notNull().default(false),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────

export const departmentRelations = relations(departments, ({ one, many }) => ({
  parent: one(departments, {
    fields: [departments.parentId],
    references: [departments.id],
    relationName: "parent_child",
  }),
  children: many(departments, { relationName: "parent_child" }),
}));

export const processDefinitionRelations = relations(
  processDefinitions,
  ({ many }) => ({
    steps: many(processSteps),
    instances: many(processInstances),
    cases: many(cases),
  })
);

export const caseRelations = relations(cases, ({ one, many }) => ({
  processDefinition: one(processDefinitions, {
    fields: [cases.processDefinitionId],
    references: [processDefinitions.id],
  }),
  processInstance: one(processInstances, {
    fields: [cases.processInstanceId],
    references: [processInstances.id],
  }),
  initiator: one(users, {
    fields: [cases.initiatorId],
    references: [users.id],
  }),
  timeline: many(caseTimeline),
  tasks: many(tasks),
  notifications: many(notifications),
}));

export const taskRelations = relations(tasks, ({ one }) => ({
  case: one(cases, {
    fields: [tasks.caseId],
    references: [cases.id],
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
  }),
  form: one(forms, {
    fields: [tasks.formId],
    references: [forms.id],
  }),
}));

export const notificationRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  case: one(cases, {
    fields: [notifications.caseId],
    references: [cases.id],
  }),
  task: one(tasks, {
    fields: [notifications.taskId],
    references: [tasks.id],
  }),
}));

// ─────────────────────────────────────────────
// INFERRED TYPES
// ─────────────────────────────────────────────

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type ProcessDefinition = typeof processDefinitions.$inferSelect;
export type NewProcessDefinition = typeof processDefinitions.$inferInsert;
export type ProcessStep = typeof processSteps.$inferSelect;
export type NewProcessStep = typeof processSteps.$inferInsert;
export type ProcessInstance = typeof processInstances.$inferSelect;
export type NewProcessInstance = typeof processInstances.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type CaseTimeline = typeof caseTimeline.$inferSelect;
export type NewCaseTimeline = typeof caseTimeline.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type SlaEscalation = typeof slaEscalations.$inferSelect;
export type NewSlaEscalation = typeof slaEscalations.$inferInsert;
export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
export type ProcessTemplate = typeof processTemplates.$inferSelect;
export type NewProcessTemplate = typeof processTemplates.$inferInsert;
