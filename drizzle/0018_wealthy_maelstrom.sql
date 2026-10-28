CREATE TABLE "rate_limits" (
	"count" integer DEFAULT 0 NOT NULL,
	"key" text NOT NULL,
	"window_start" timestamp NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "webhook_attempts" (
	"attempt" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivery_id" text NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error" text,
	"id" text PRIMARY KEY NOT NULL,
	"response" text,
	"status_code" integer
);
--> statement-breakpoint
ALTER TABLE "webhook_attempts" ADD CONSTRAINT "webhook_attempts_delivery_id_webhook_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_attempts_delivery_idx" ON "webhook_attempts" USING btree ("delivery_id","attempt");