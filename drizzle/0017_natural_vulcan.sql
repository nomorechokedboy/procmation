CREATE TABLE "process_triggers" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"definition_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"field_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"last_used_at" timestamp,
	"name" text NOT NULL,
	"signing_secret" text,
	"title_path" text,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "process_triggers_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "trigger_requests" (
	"case_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"idempotency_key" text NOT NULL,
	"trigger_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_service" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "process_triggers" ADD CONSTRAINT "process_triggers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_triggers" ADD CONSTRAINT "process_triggers_definition_id_process_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."process_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_requests" ADD CONSTRAINT "trigger_requests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_requests" ADD CONSTRAINT "trigger_requests_trigger_id_process_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."process_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "process_triggers_definition_idx" ON "process_triggers" USING btree ("definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_requests_key_idx" ON "trigger_requests" USING btree ("trigger_id","idempotency_key");