CREATE TYPE "public"."gallery_status" AS ENUM('open', 'closed', 'archived');--> statement-breakpoint
CREATE TABLE "galleries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_clerk_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"access_version" integer DEFAULT 1 NOT NULL,
	"status" "gallery_status" DEFAULT 'open' NOT NULL,
	"event_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "galleries_access_version_positive" CHECK ("galleries"."access_version" >= 1),
	CONSTRAINT "galleries_name_not_blank" CHECK (length(btrim("galleries"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "galleries_slug_unique" ON "galleries" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "galleries_owner_created_at_idx" ON "galleries" USING btree ("owner_clerk_id","created_at");