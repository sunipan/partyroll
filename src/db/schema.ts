import {
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
]);

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

