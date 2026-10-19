CREATE TABLE "audit_logs" (
	"action" text NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"metadata" jsonb,
	"parent_id" text,
	"parent_label" text,
	"parent_type" text,
	"resource_id" text,
	"resource_label" text,
	"resource_type" text NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_parent_idx" ON "audit_logs" USING btree ("parent_type","parent_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");