CREATE TYPE "public"."photo_status" AS ENUM('pending', 'processing', 'ready', 'rejected', 'deleting');--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gallery_id" uuid NOT NULL,
	"status" "photo_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"uploader_session_hash" text NOT NULL,
	"quarantine_object_key" text NOT NULL,
	"display_object_key" text,
	"thumbnail_object_key" text,
	"declared_mime_type" text NOT NULL,
	"declared_byte_size" integer NOT NULL,
	"mime_type" text,
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"reservation_expires_at" timestamp with time zone NOT NULL,
	"processing_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	CONSTRAINT "photos_declared_byte_size_positive" CHECK ("photos"."declared_byte_size" > 0),
	CONSTRAINT "photos_byte_size_positive" CHECK ("photos"."byte_size" is null or "photos"."byte_size" > 0),
	CONSTRAINT "photos_width_positive" CHECK ("photos"."width" is null or "photos"."width" > 0),
	CONSTRAINT "photos_height_positive" CHECK ("photos"."height" is null or "photos"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "photo_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "reserved_photo_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "storage_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "reserved_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_gallery_id_galleries_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photos_gallery_session_idempotency_unique" ON "photos" USING btree ("gallery_id","uploader_session_hash","idempotency_key");--> statement-breakpoint
CREATE INDEX "photos_gallery_status_created_at_idx" ON "photos" USING btree ("gallery_id","status","created_at");--> statement-breakpoint
CREATE INDEX "photos_pending_expiration_idx" ON "photos" USING btree ("status","reservation_expires_at");--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_photo_count_nonnegative" CHECK ("galleries"."photo_count" >= 0);--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_reserved_photo_count_nonnegative" CHECK ("galleries"."reserved_photo_count" >= 0);--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_storage_bytes_nonnegative" CHECK ("galleries"."storage_bytes" >= 0);--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_reserved_bytes_nonnegative" CHECK ("galleries"."reserved_bytes" >= 0);