import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));

const owner = `partyroll-schema-${randomUUID()}`;
const createdGalleryIds: string[] = [];

let db: (typeof import("@/db"))["db"];
let galleries: (typeof import("@/db/schema"))["galleries"];
let galleryQueries: typeof import("@/lib/galleries/queries");

describe("gallery deletion schema constraints", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ galleries } = await import("@/db/schema"));
    galleryQueries = await import("@/lib/galleries/queries");
  });

  afterEach(async () => {
    if (createdGalleryIds.length > 0) {
      await db.delete(galleries).where(inArray(galleries.id, createdGalleryIds));
      createdGalleryIds.length = 0;
    }
  });

  it("requires explicit gallery deletion metadata only in deleting state", async () => {
    const gallery = await createGallery();

    await expect(
      db
        .update(galleries)
        .set({ status: "deleting" })
        .where(eq(galleries.id, gallery.id)),
    ).rejects.toThrow();

    await expect(
      db
        .update(galleries)
        .set({
          status: "deleting",
          deletionRequestedAt: new Date("2026-07-19T12:00:00.000Z"),
        })
        .where(eq(galleries.id, gallery.id)),
    ).resolves.toBeDefined();

    await expect(
      db
        .update(galleries)
        .set({ status: "open" })
        .where(eq(galleries.id, gallery.id)),
    ).rejects.toThrow();

    await expect(
      db
        .update(galleries)
        .set({ status: "open", deletionRequestedAt: null })
        .where(eq(galleries.id, gallery.id)),
    ).resolves.toBeDefined();

    await expect(
      db
        .update(galleries)
        .set({ deletionRequestedAt: new Date("2026-07-19T12:01:00.000Z") })
        .where(eq(galleries.id, gallery.id)),
    ).rejects.toThrow();
  });
});

async function createGallery() {
  const gallery = await galleryQueries.createGalleryForOwner(owner, {
    name: `Schema ${randomUUID()}`,
    eventDate: undefined,
  });
  createdGalleryIds.push(gallery.id);
  return gallery;
}
