import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));

const owner = `partyroll-guest-test-${randomUUID()}`;

let db: (typeof import("@/db"))["db"];
let galleries: (typeof import("@/db/schema"))["galleries"];
let galleryIds: string[] = [];
let queries: typeof import("./queries");
let galleryQueries: typeof import("@/lib/galleries/queries");

describe("guest gallery authorization", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ galleries } = await import("@/db/schema"));
    queries = await import("./queries");
    galleryQueries = await import("@/lib/galleries/queries");

    const [openGallery, otherGallery, archivedGallery] = await Promise.all([
      galleryQueries.createGalleryForOwner(owner, {
        name: `Guest Open ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(owner, {
        name: `Guest Other ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(owner, {
        name: `Guest Archived ${randomUUID()}`,
        eventDate: undefined,
      }),
    ]);
    galleryIds = [openGallery.id, otherGallery.id, archivedGallery.id];

    await db
      .update(galleries)
      .set({ status: "archived" })
      .where(eq(galleries.id, archivedGallery.id));
  });

  afterAll(async () => {
    if (db && galleries && galleryIds.length > 0) {
      await db.delete(galleries).where(inArray(galleries.id, galleryIds));
    }
  });

  it("returns the current non-archived gallery for its exact session scope", async () => {
    const [gallery] = await db
      .select()
      .from(galleries)
      .where(eq(galleries.id, galleryIds[0]));

    await expect(
      queries.getGalleryForGuestSession({
        galleryId: gallery.id,
        slug: gallery.slug,
        accessVersion: gallery.accessVersion,
      }),
    ).resolves.toMatchObject({ id: gallery.id });
  });

  it("denies another gallery slug and a rotated access version", async () => {
    const records = await db
      .select()
      .from(galleries)
      .where(inArray(galleries.id, galleryIds));
    const gallery = records.find((record) => record.id === galleryIds[0])!;
    const otherGallery = records.find((record) => record.id === galleryIds[1])!;

    await expect(
      queries.getGalleryForGuestSession({
        galleryId: gallery.id,
        slug: otherGallery.slug,
        accessVersion: gallery.accessVersion,
      }),
    ).resolves.toBeNull();
    await expect(
      queries.getGalleryForGuestSession({
        galleryId: gallery.id,
        slug: gallery.slug,
        accessVersion: gallery.accessVersion + 1,
      }),
    ).resolves.toBeNull();
  });

  it("denies archived galleries", async () => {
    const [gallery] = await db
      .select()
      .from(galleries)
      .where(eq(galleries.id, galleryIds[2]));

    await expect(
      queries.getGalleryForGuestSession({
        galleryId: gallery.id,
        slug: gallery.slug,
        accessVersion: gallery.accessVersion,
      }),
    ).resolves.toBeNull();
  });
});
