CREATE SEQUENCE "public"."case_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "cases" DROP CONSTRAINT "cases_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "cases" DROP CONSTRAINT "cases_department_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "process_instances" DROP CONSTRAINT "process_instances_workflow_execution_id_workflow_executions_id_fk";
--> statement-breakpoint
ALTER TABLE "process_instances" DROP CONSTRAINT "process_instances_case_id_cases_id_fk";
--> statement-breakpoint
DROP INDEX "notifications_user_read_idx";--> statement-breakpoint
ALTER TABLE "case_timeline" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "case_timeline" ALTER COLUMN "data" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "body" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "case_timeline" ADD COLUMN "event_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "case_timeline" ADD COLUMN "node_id" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "case_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "process_definition_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "process_instance_id" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "priority" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "initiator_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "participants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "due_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "read" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "case_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_process_definition_id_process_definitions_id_fk" FOREIGN KEY ("process_definition_id") REFERENCES "public"."process_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_process_instance_id_process_instances_id_fk" FOREIGN KEY ("process_instance_id") REFERENCES "public"."process_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_initiator_id_users_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_instances" ADD CONSTRAINT "process_instances_execution_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_initiator_idx" ON "cases" USING btree ("initiator_id");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_instance_idx" ON "cases" USING btree ("process_instance_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
ALTER TABLE "case_timeline" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "department_id";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "closed_at";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "link";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "read_at";--> statement-breakpoint
ALTER TABLE "process_instances" DROP COLUMN "case_id";--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_case_number_unique" UNIQUE("case_number");