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
let photos: (typeof import("@/db/schema"))["photos"];
let galleryQueries: typeof import("@/lib/galleries/queries");

describe("deletion lifecycle schema constraints", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ galleries, photos } = await import("@/db/schema"));
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
        .set({ deletionFailureReason: "   " })
        .where(eq(galleries.id, gallery.id)),
    ).rejects.toThrow();
  });

  it("keeps owner-deleting ready media explicit and accounting-safe", async () => {
    const gallery = await createGallery();
    const mediaId = randomUUID();
    const deletionRequestedAt = new Date("2026-07-19T12:00:00.000Z");

    await expect(
      db.insert(photos).values(
        photoFixture({
          id: mediaId,
          galleryId: gallery.id,
          status: "delete_pending",
          deletionRequestedAt,
        }),
      ),
    ).rejects.toThrow();

    await expect(
      db.insert(photos).values(
        photoFixture({
          id: mediaId,
          galleryId: gallery.id,
          status: "delete_pending",
          deletionRequestedAt,
          deletionAccountedAt: deletionRequestedAt,
        }),
      ),
    ).resolves.toBeDefined();

    await expect(
      db
        .update(photos)
        .set({ deletionFailureReason: "   " })
        .where(eq(photos.id, mediaId)),
    ).rejects.toThrow();
  });

  it("rejects deletion metadata on non-deleting media states", async () => {
    const gallery = await createGallery();

    await expect(
      db.insert(photos).values(
        photoFixture({
          id: randomUUID(),
          galleryId: gallery.id,
          status: "ready",
          deletionRequestedAt: new Date("2026-07-19T12:00:00.000Z"),
          deletionAccountedAt: new Date("2026-07-19T12:00:00.000Z"),
        }),
      ),
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

function photoFixture({
  id,
  galleryId,
  status,
  deletionRequestedAt = null,
  deletionAccountedAt = null,
}: {
  id: string;
  galleryId: string;
  status: "ready" | "delete_pending";
  deletionRequestedAt?: Date | null;
  deletionAccountedAt?: Date | null;
}) {
  return {
    id,
    galleryId,
    status,
    idempotencyKey: randomUUID(),
    uploaderSessionHash: "d".repeat(64),
    quarantineObjectKey: `quarantine/${galleryId}/${id}`,
    declaredMimeType: "image/jpeg",
    originalFilename: "schema.jpg",
    mediaKind: "image" as const,
    originalObjectKey: `originals/${galleryId}/${id}`,
    displayObjectKey: `photos/${galleryId}/${id}/display.jpg`,
    thumbnailObjectKey: `photos/${galleryId}/${id}/thumbnail.jpg`,
    declaredByteSize: 1024,
    mimeType: "image/jpeg",
    byteSize: 2048,
    width: 800,
    height: 600,
    reservationExpiresAt: new Date("2026-07-19T12:15:00.000Z"),
    readyAt: new Date("2026-07-19T12:01:00.000Z"),
    deletionRequestedAt,
    deletionAccountedAt,
  };
}
