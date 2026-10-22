CREATE TABLE "process_versions" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"definition_id" text NOT NULL,
	"description" text,
	"edges" jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"nodes" jsonb NOT NULL,
	"note" text,
	"published_by_id" text,
	"start_form_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "process_definitions" ALTER COLUMN "version" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "process_instances" ADD COLUMN "version_id" text;--> statement-breakpoint
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_definition_id_process_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."process_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "process_versions_definition_version_idx" ON "process_versions" USING btree ("definition_id","version");--> statement-breakpoint
ALTER TABLE "process_instances" ADD CONSTRAINT "process_instances_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Every process that was ever published gets version 1 from its current state,
-- and the runs already started are attached to it. Never-published ones have no version yet.
INSERT INTO "process_versions" ("id", "definition_id", "version", "name", "description", "nodes", "edges", "start_form_fields", "published_by_id", "created_at")
SELECT gen_random_uuid()::text, d."id", 1, w."name", w."description", w."nodes", w."edges", d."start_form_fields", d."created_by", COALESCE(d."published_at", now())
FROM "process_definitions" d JOIN "workflows" w ON w."id" = d."workflow_id"
WHERE d."published_at" IS NOT NULL;--> statement-breakpoint
UPDATE "process_definitions" SET "version" = CASE WHEN "published_at" IS NOT NULL THEN 1 ELSE 0 END;--> statement-breakpoint
UPDATE "process_instances" i SET "version_id" = v."id" FROM "process_versions" v WHERE v."definition_id" = i."definition_id" AND v."version" = 1;
