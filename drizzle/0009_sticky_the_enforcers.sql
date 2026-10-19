ALTER TABLE "tasks" ADD COLUMN "escalated_at" timestamp;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "escalated_to_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reminded_at" timestamp;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_escalated_to_id_users_id_fk" FOREIGN KEY ("escalated_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;