import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));
vi.mock("./objects", () => ({
  deleteUploadObjects: vi.fn(),
  getDisplayObjectKey: (galleryId: string, photoId: string) =>
    `photos/${galleryId}/${photoId}/display.jpg`,
  getMediaDeletionObjectKeys: ({
    galleryId,
    id,
    quarantineObjectKey,
    mediaKind,
    originalObjectKey,
    displayObjectKey,
    thumbnailObjectKey,
  }: {
    galleryId: string;
    id: string;
    quarantineObjectKey: string;
    mediaKind: "image" | "video";
    originalObjectKey: string;
    displayObjectKey: string | null;
    thumbnailObjectKey: string | null;
  }) => [
    ...new Set([
      quarantineObjectKey,
      originalObjectKey,
      `quarantine/${galleryId}/${id}`,
      `originals/${galleryId}/${id}`,
      ...(mediaKind === "image"
        ? [
            displayObjectKey,
            thumbnailObjectKey,
            `photos/${galleryId}/${id}/display.jpg`,
            `photos/${galleryId}/${id}/thumbnail.jpg`,
          ]
        : []),
    ]),
  ],
  getOriginalObjectKey: (galleryId: string, photoId: string) =>
    `originals/${galleryId}/${photoId}`,
  getQuarantineObjectKey: (galleryId: string, photoId: string) =>
    `quarantine/${galleryId}/${photoId}`,
  getThumbnailObjectKey: (galleryId: string, photoId: string) =>
    `photos/${galleryId}/${photoId}/thumbnail.jpg`,
}));

import { galleries, photos } from "@/db/schema";

import { deleteUploadObjects } from "./objects";

const owner = `partyroll-media-delete-${randomUUID()}`;
const otherOwner = `${owner}-other`;
const sessionHash = "f".repeat(64);
const declaredByteSize = 1024;
const finalByteSize = 2048;
const createdGalleryIds: string[] = [];

let db: (typeof import("@/db"))["db"];
let galleryQueries: typeof import("@/lib/galleries/queries");
let mediaService: typeof import("./media");

describe("owner media deletion", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    galleryQueries = await import("@/lib/galleries/queries");
    mediaService = await import("./media");
  });

  beforeEach(() => {
    vi.mocked(deleteUploadObjects).mockReset();
    vi.mocked(deleteUploadObjects).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (db && createdGalleryIds.length > 0) {
      await db.delete(galleries).where(inArray(galleries.id, createdGalleryIds));
      createdGalleryIds.length = 0;
    }
  });

  it("denies cross-owner deletion without R2 side effects or accounting changes", async () => {
    const gallery = await createGallery(owner);
    const photo = await insertReadyPhoto(gallery.id);

    await expect(
      mediaService.deleteReadyMediaForOwner({
        ownerClerkId: otherOwner,
        galleryId: gallery.id,
        photoId: photo.id,
      }),
    ).resolves.toEqual({ outcome: "not-found" });

    expect(deleteUploadObjects).not.toHaveBeenCalled();
    await expect(getGalleryAccounting(gallery.id)).resolves.toEqual({
      photoCount: 1,
      storageBytes: finalByteSize,
    });
    await expect(getPhotoStatus(photo.id)).resolves.toBe("ready");
  });

  it("deletes provider objects before deleting the ready row and accounting", async () => {
    const gallery = await createGallery(owner);
    const photo = await insertReadyPhoto(gallery.id, {
      quarantineObjectKey: `custom/${gallery.id}/${randomUUID()}/quarantine`,
      originalObjectKey: `custom/${gallery.id}/${randomUUID()}/original`,
      displayObjectKey: `custom/${gallery.id}/${randomUUID()}/display.jpg`,
      thumbnailObjectKey: `custom/${gallery.id}/${randomUUID()}/thumbnail.jpg`,
    });

    await expect(
      mediaService.deleteReadyMediaForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        photoId: photo.id,
      }),
    ).resolves.toMatchObject({ outcome: "deleted", media: { id: photo.id } });

    expect(new Set(vi.mocked(deleteUploadObjects).mock.calls[0][0])).toEqual(
      new Set([
        photo.quarantineObjectKey,
        photo.originalObjectKey,
        `quarantine/${gallery.id}/${photo.id}`,
        `originals/${gallery.id}/${photo.id}`,
        photo.displayObjectKey,
        photo.thumbnailObjectKey,
        `photos/${gallery.id}/${photo.id}/display.jpg`,
        `photos/${gallery.id}/${photo.id}/thumbnail.jpg`,
      ]),
    );
    await expect(getPhoto(photo.id)).resolves.toBeNull();
    await expect(getGalleryAccounting(gallery.id)).resolves.toEqual({
      photoCount: 0,
      storageBytes: 0,
    });
  });

  it("leaves the ready row and accounting unchanged when provider deletion fails", async () => {
    const gallery = await createGallery(owner);
    const photo = await insertReadyPhoto(gallery.id);
    vi.mocked(deleteUploadObjects).mockRejectedValueOnce(new Error("R2 failed"));

    await expect(
      mediaService.deleteReadyMediaForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        photoId: photo.id,
      }),
    ).resolves.toMatchObject({
      outcome: "retryable-error",
      message: "Media could not be deleted. Please try again.",
      media: { id: photo.id },
    });

    await expect(getPhotoStatus(photo.id)).resolves.toBe("ready");
    await expect(getGalleryAccounting(gallery.id)).resolves.toEqual({
      photoCount: 1,
      storageBytes: finalByteSize,
    });
  });

  it("lets a later retry delete the unchanged ready row after provider recovery", async () => {
    const gallery = await createGallery(owner);
    const photo = await insertReadyPhoto(gallery.id);
    vi.mocked(deleteUploadObjects)
      .mockRejectedValueOnce(new Error("R2 failed"))
      .mockResolvedValueOnce(undefined);

    await expect(
      mediaService.deleteReadyMediaForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        photoId: photo.id,
      }),
    ).resolves.toMatchObject({ outcome: "retryable-error" });
    await expect(
      mediaService.deleteReadyMediaForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        photoId: photo.id,
      }),
    ).resolves.toMatchObject({ outcome: "deleted", media: { id: photo.id } });

    expect(deleteUploadObjects).toHaveBeenCalledTimes(2);
    await expect(getPhoto(photo.id)).resolves.toBeNull();
    await expect(getGalleryAccounting(gallery.id)).resolves.toEqual({
      photoCount: 0,
      storageBytes: 0,
    });
  });
});

async function createGallery(ownerClerkId: string) {
  const gallery = await galleryQueries.createGalleryForOwner(ownerClerkId, {
    name: `Media Delete ${randomUUID()}`,
    eventDate: undefined,
  });
  createdGalleryIds.push(gallery.id);
  return gallery;
}

async function insertReadyPhoto(
  galleryId: string,
  objectKeys: Partial<{
    quarantineObjectKey: string;
    originalObjectKey: string;
    displayObjectKey: string;
    thumbnailObjectKey: string;
  }> = {},
) {
  const photo = readyPhotoFixture({ galleryId, ...objectKeys });
  await db.insert(photos).values(photo);
  await db
    .update(galleries)
    .set({ photoCount: 1, storageBytes: finalByteSize })
    .where(eq(galleries.id, galleryId));
  return photo;
}

function readyPhotoFixture({
  galleryId,
  quarantineObjectKey,
  originalObjectKey,
  displayObjectKey,
  thumbnailObjectKey,
}: {
  galleryId: string;
  quarantineObjectKey?: string;
  originalObjectKey?: string;
  displayObjectKey?: string;
  thumbnailObjectKey?: string;
}) {
  const id = randomUUID();

  return {
    id,
    galleryId,
    status: "ready" as const,
    idempotencyKey: randomUUID(),
    uploaderSessionHash: sessionHash,
    quarantineObjectKey: quarantineObjectKey ?? `quarantine/${galleryId}/${id}`,
    declaredMimeType: "image/jpeg",
    originalFilename: "delete-me.jpg",
    mediaKind: "image" as const,
    originalObjectKey: originalObjectKey ?? `originals/${galleryId}/${id}`,
    displayObjectKey: displayObjectKey ?? `photos/${galleryId}/${id}/display.jpg`,
    thumbnailObjectKey:
      thumbnailObjectKey ?? `photos/${galleryId}/${id}/thumbnail.jpg`,
    declaredByteSize,
    mimeType: "image/jpeg",
    byteSize: finalByteSize,
    width: 800,
    height: 600,
    reservationExpiresAt: new Date("2026-07-19T18:15:00.000Z"),
    createdAt: new Date("2026-07-19T17:58:00.000Z"),
    readyAt: new Date("2026-07-19T17:59:00.000Z"),
  };
}

async function getGalleryAccounting(galleryId: string) {
  const [gallery] = await db
    .select({
      photoCount: galleries.photoCount,
      storageBytes: galleries.storageBytes,
    })
    .from(galleries)
    .where(eq(galleries.id, galleryId));

  return gallery;
}

async function getPhoto(photoId: string) {
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId));
  return photo ?? null;
}

async function getPhotoStatus(photoId: string) {
  return (await getPhoto(photoId))?.status ?? null;
}
