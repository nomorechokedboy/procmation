CREATE TABLE "roles" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
INSERT INTO "roles" ("key", "name", "description", "is_system") VALUES
	('admin', 'Admin', 'Can do everything', true),
	('member', 'Member', 'Starts cases and works on their own tasks', true);--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_roles_key_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_roles_key_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("key") ON DELETE no action ON UPDATE no action;