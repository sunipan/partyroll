ALTER TYPE "public"."gallery_status" ADD VALUE 'deleting';--> statement-breakpoint
ALTER TYPE "public"."photo_status" ADD VALUE 'delete_pending';--> statement-breakpoint
ALTER TABLE "photos" DROP CONSTRAINT "photos_image_derivatives_required";--> statement-breakpoint
ALTER TABLE "photos" DROP CONSTRAINT "photos_ready_final_metadata_required";--> statement-breakpoint
ALTER TABLE "photos" DROP CONSTRAINT "photos_non_ready_final_metadata_absent";--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "deletion_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "next_deletion_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "deletion_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "deletion_failure_reason" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "deletion_accounted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "deletion_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "next_deletion_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "deletion_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "deletion_failure_reason" text;--> statement-breakpoint
CREATE INDEX "galleries_deletion_retry_idx" ON "galleries" USING btree ("status","next_deletion_attempt_at");--> statement-breakpoint
CREATE INDEX "photos_deletion_retry_idx" ON "photos" USING btree ("status","next_deletion_attempt_at");--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_deletion_attempts_nonnegative" CHECK ("galleries"."deletion_attempts" >= 0);--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_deleting_metadata" CHECK ((("galleries"."status"::text = 'deleting' and "galleries"."deletion_requested_at" is not null) or ("galleries"."status"::text <> 'deleting' and "galleries"."deletion_requested_at" is null and "galleries"."deletion_attempts" = 0 and "galleries"."next_deletion_attempt_at" is null and "galleries"."deletion_failed_at" is null and "galleries"."deletion_failure_reason" is null)));--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_deletion_failure_reason_not_blank" CHECK ("galleries"."deletion_failure_reason" is null or length(btrim("galleries"."deletion_failure_reason")) > 0);--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_deletion_failure_metadata" CHECK ((("galleries"."deletion_failed_at" is null and "galleries"."next_deletion_attempt_at" is null and "galleries"."deletion_failure_reason" is null) or ("galleries"."deletion_failed_at" is not null and "galleries"."next_deletion_attempt_at" is not null and "galleries"."deletion_failure_reason" is not null and "galleries"."deletion_attempts" > 0)));--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_deletion_attempts_nonnegative" CHECK ("photos"."deletion_attempts" >= 0);--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_delete_pending_metadata" CHECK ((("photos"."status"::text = 'delete_pending' and "photos"."deletion_requested_at" is not null and "photos"."deletion_accounted_at" is not null) or ("photos"."status"::text <> 'delete_pending' and "photos"."deletion_requested_at" is null and "photos"."deletion_accounted_at" is null and "photos"."deletion_attempts" = 0 and "photos"."next_deletion_attempt_at" is null and "photos"."deletion_failed_at" is null and "photos"."deletion_failure_reason" is null)));--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_deletion_failure_reason_not_blank" CHECK ("photos"."deletion_failure_reason" is null or length(btrim("photos"."deletion_failure_reason")) > 0);--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_deletion_failure_metadata" CHECK ((("photos"."deletion_failed_at" is null and "photos"."next_deletion_attempt_at" is null and "photos"."deletion_failure_reason" is null) or ("photos"."deletion_failed_at" is not null and "photos"."next_deletion_attempt_at" is not null and "photos"."deletion_failure_reason" is not null and "photos"."deletion_attempts" > 0)));--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_image_derivatives_required" CHECK (("photos"."media_kind" <> 'image') or ("photos"."display_object_key" is not null and "photos"."thumbnail_object_key" is not null and ("photos"."status"::text not in ('ready', 'delete_pending') or ("photos"."width" is not null and "photos"."height" is not null))));--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_ready_final_metadata_required" CHECK (("photos"."status"::text not in ('ready', 'delete_pending')) or ("photos"."ready_at" is not null and "photos"."mime_type" is not null and "photos"."byte_size" is not null));--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_non_ready_final_metadata_absent" CHECK (("photos"."status"::text in ('ready', 'delete_pending')) or ("photos"."ready_at" is null and "photos"."mime_type" is null and "photos"."byte_size" is null and "photos"."width" is null and "photos"."height" is null));