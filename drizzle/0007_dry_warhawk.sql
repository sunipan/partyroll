ALTER TYPE "public"."gallery_status" ADD VALUE 'deleting';--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_deleting_metadata" CHECK ((("galleries"."status"::text = 'deleting' and "galleries"."deletion_requested_at" is not null) or ("galleries"."status"::text <> 'deleting' and "galleries"."deletion_requested_at" is null)));
