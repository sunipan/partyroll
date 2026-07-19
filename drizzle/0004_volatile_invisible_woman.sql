ALTER TABLE "photos" ADD COLUMN "completion_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "next_processing_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_completion_attempts_nonnegative" CHECK ("photos"."completion_attempts" >= 0);