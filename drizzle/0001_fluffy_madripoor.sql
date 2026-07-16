CREATE TABLE "rate_limit_counters" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_counters_attempts_nonnegative" CHECK ("rate_limit_counters"."attempts" >= 0),
	CONSTRAINT "rate_limit_counters_scope_not_blank" CHECK (length(btrim("rate_limit_counters"."scope")) > 0)
);
--> statement-breakpoint
CREATE INDEX "rate_limit_counters_expires_at_idx" ON "rate_limit_counters" USING btree ("expires_at");