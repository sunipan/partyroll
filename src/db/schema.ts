import {
  bigint,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const galleryStatus = pgEnum("gallery_status", [
  "open",
  "closed",
  "archived",
  "deleting",
]);

export const photoStatus = pgEnum("photo_status", [
  "pending",
  "processing",
  "ready",
  "rejected",
  "deleting",
]);

export const mediaKind = pgEnum("media_kind", ["image", "video"]);

export const galleries = pgTable(
  "galleries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerClerkId: text("owner_clerk_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    accessVersion: integer("access_version").default(1).notNull(),
    status: galleryStatus("status").default("open").notNull(),
    eventDate: date("event_date"),
    photoCount: integer("photo_count").default(0).notNull(),
    reservedPhotoCount: integer("reserved_photo_count").default(0).notNull(),
    storageBytes: bigint("storage_bytes", { mode: "number" }).default(0).notNull(),
    reservedBytes: bigint("reserved_bytes", { mode: "number" })
      .default(0)
      .notNull(),
    deletionRequestedAt: timestamp("deletion_requested_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("galleries_slug_unique").on(table.slug),
    index("galleries_owner_created_at_idx").on(
      table.ownerClerkId,
      table.createdAt,
    ),
    check(
      "galleries_access_version_positive",
      sql`${table.accessVersion} >= 1`,
    ),
    check("galleries_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check("galleries_photo_count_nonnegative", sql`${table.photoCount} >= 0`),
    check(
      "galleries_reserved_photo_count_nonnegative",
      sql`${table.reservedPhotoCount} >= 0`,
    ),
    check("galleries_storage_bytes_nonnegative", sql`${table.storageBytes} >= 0`),
    check(
      "galleries_reserved_bytes_nonnegative",
      sql`${table.reservedBytes} >= 0`,
    ),
    check(
      "galleries_deleting_metadata",
      sql`((${table.status}::text = 'deleting' and ${table.deletionRequestedAt} is not null) or (${table.status}::text <> 'deleting' and ${table.deletionRequestedAt} is null))`,
    ),
  ],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    status: photoStatus("status").default("pending").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    uploaderSessionHash: text("uploader_session_hash").notNull(),
    quarantineObjectKey: text("quarantine_object_key").notNull(),
    quarantineDeletedAt: timestamp("quarantine_deleted_at", {
      withTimezone: true,
    }),
    declaredMimeType: text("declared_mime_type").notNull(),
    originalFilename: text("original_filename").notNull(),
    mediaKind: mediaKind("media_kind").notNull(),
    originalObjectKey: text("original_object_key").notNull(),
    displayObjectKey: text("display_object_key"),
    thumbnailObjectKey: text("thumbnail_object_key"),
    declaredByteSize: integer("declared_byte_size").notNull(),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    width: integer("width"),
    height: integer("height"),
    reservationExpiresAt: timestamp("reservation_expires_at", {
      withTimezone: true,
    }).notNull(),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    completionAttempts: integer("completion_attempts").default(0).notNull(),
    nextProcessingAttemptAt: timestamp("next_processing_attempt_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("photos_gallery_session_idempotency_unique").on(
      table.galleryId,
      table.uploaderSessionHash,
      table.idempotencyKey,
    ),
    index("photos_gallery_status_created_at_idx").on(
      table.galleryId,
      table.status,
      table.createdAt,
    ),
    index("photos_pending_expiration_idx").on(
      table.status,
      table.reservationExpiresAt,
    ),
    check("photos_declared_byte_size_positive", sql`${table.declaredByteSize} > 0`),
    check("photos_byte_size_positive", sql`${table.byteSize} is null or ${table.byteSize} > 0`),
    check("photos_width_positive", sql`${table.width} is null or ${table.width} > 0`),
    check("photos_height_positive", sql`${table.height} is null or ${table.height} > 0`),
    check(
      "photos_image_derivatives_required",
      sql`(${table.mediaKind} <> 'image') or (${table.displayObjectKey} is not null and ${table.thumbnailObjectKey} is not null and (${table.status}::text <> 'ready' or (${table.width} is not null and ${table.height} is not null)))`,
    ),
    check(
      "photos_video_original_only",
      sql`(${table.mediaKind} <> 'video') or (${table.displayObjectKey} is null and ${table.thumbnailObjectKey} is null and ${table.width} is null and ${table.height} is null)`,
    ),
    check(
      "photos_original_object_key_not_blank",
      sql`length(btrim(${table.originalObjectKey})) > 0`,
    ),
    check(
      "photos_original_filename_not_blank",
      sql`length(btrim(${table.originalFilename})) > 0`,
    ),
    check(
      "photos_declared_mime_type_not_blank",
      sql`length(btrim(${table.declaredMimeType})) > 0`,
    ),
    check(
      "photos_display_object_key_not_blank",
      sql`${table.displayObjectKey} is null or length(btrim(${table.displayObjectKey})) > 0`,
    ),
    check(
      "photos_thumbnail_object_key_not_blank",
      sql`${table.thumbnailObjectKey} is null or length(btrim(${table.thumbnailObjectKey})) > 0`,
    ),
    check(
      "photos_quarantine_object_key_not_blank",
      sql`length(btrim(${table.quarantineObjectKey})) > 0`,
    ),
    check(
      "photos_declared_media_kind_matches_mime",
      sql`((${table.mediaKind} = 'image' and ${table.declaredMimeType} in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')) or (${table.mediaKind} = 'video' and ${table.declaredMimeType} in ('video/mp4', 'video/quicktime', 'video/webm')))`,
    ),
    check(
      "photos_ready_final_metadata_required",
      sql`(${table.status}::text <> 'ready') or (${table.readyAt} is not null and ${table.mimeType} is not null and ${table.byteSize} is not null)`,
    ),
    check(
      "photos_non_ready_final_metadata_absent",
      sql`(${table.status}::text = 'ready') or (${table.readyAt} is null and ${table.mimeType} is null and ${table.byteSize} is null and ${table.width} is null and ${table.height} is null)`,
    ),
    check(
      "photos_final_mime_type_matches_media_kind",
      sql`${table.mimeType} is null or ((${table.mediaKind} = 'image' and ${table.mimeType} in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')) or (${table.mediaKind} = 'video' and ${table.mimeType} in ('video/mp4', 'video/quicktime', 'video/webm')))`,
    ),
    check(
      "photos_completion_attempts_nonnegative",
      sql`${table.completionAttempts} >= 0`,
    ),
  ],
);

export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    keyHash: text("key_hash").primaryKey(),
    scope: text("scope").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("rate_limit_counters_expires_at_idx").on(table.expiresAt),
    check(
      "rate_limit_counters_attempts_nonnegative",
      sql`${table.attempts} >= 0`,
    ),
    check(
      "rate_limit_counters_scope_not_blank",
      sql`length(btrim(${table.scope})) > 0`,
    ),
  ],
);

export type Gallery = typeof galleries.$inferSelect;
export type NewGallery = typeof galleries.$inferInsert;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
