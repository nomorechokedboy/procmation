CREATE TABLE "delegations" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	"ends_at" timestamp NOT NULL,
	"from_user_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"revoked_at" timestamp,
	"starts_at" timestamp NOT NULL,
	"to_user_id" text NOT NULL,
	CONSTRAINT "delegations_ends_after_start" CHECK ("delegations"."ends_at" > "delegations"."starts_at"),
	CONSTRAINT "delegations_not_self" CHECK ("delegations"."from_user_id" <> "delegations"."to_user_id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "delegated_from_id" text;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delegations_from_idx" ON "delegations" USING btree ("from_user_id","starts_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_delegated_from_id_users_id_fk" FOREIGN KEY ("delegated_from_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;