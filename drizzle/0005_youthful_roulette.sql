CREATE TYPE "public"."media_kind" AS ENUM('image', 'video');--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "media_kind" "media_kind";--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "original_object_key" text;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_image_derivatives_required" CHECK (("photos"."status" <> 'ready') or ("photos"."media_kind" <> 'image') or ("photos"."display_object_key" is not null and "photos"."thumbnail_object_key" is not null and "photos"."width" is not null and "photos"."height" is not null));--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_video_original_only" CHECK (("photos"."media_kind" <> 'video') or ("photos"."display_object_key" is null and "photos"."thumbnail_object_key" is null and "photos"."width" is null and "photos"."height" is null));--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_original_object_key_not_blank" CHECK (length(btrim("photos"."original_object_key")) > 0);--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_declared_mime_type_not_blank" CHECK (length(btrim("photos"."declared_mime_type")) > 0);