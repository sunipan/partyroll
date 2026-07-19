import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });

const deleteGalleryObjectsMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/uploads/gallery-object-deletion", () => ({
  deleteGalleryObjects: deleteGalleryObjectsMock,
}));

import { galleries, photos } from "@/db/schema";

const owner = `partyroll-gallery-delete-${randomUUID()}`;
const otherOwner = `${owner}-other`;
const createdGalleryIds: string[] = [];

let db: (typeof import("@/db"))["db"];
let galleryQueries: typeof import("./queries");
let guestQueries: typeof import("@/lib/guest-access/queries");
let uploadQueries: typeof import("@/lib/uploads/queries");

describe("gallery deletion", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    galleryQueries = await import("./queries");
    guestQueries = await import("@/lib/guest-access/queries");
    uploadQueries = await import("@/lib/uploads/queries");
  });

  beforeEach(() => {
    deleteGalleryObjectsMock.mockReset();
    deleteGalleryObjectsMock.mockResolvedValue({ status: "complete" });
  });

  afterEach(async () => {
    if (db && createdGalleryIds.length > 0) {
      await db.delete(galleries).where(inArray(galleries.id, createdGalleryIds));
      createdGalleryIds.length = 0;
    }
  });

  it("requires an exact gallery name before marking deletion", async () => {
    const gallery = await createGallery(owner);

    await expect(
      galleryQueries.deleteGalleryForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        confirmationName: `${gallery.name} `,
      }),
    ).resolves.toEqual({ outcome: "name-mismatch" });

    expect(deleteGalleryObjectsMock).not.toHaveBeenCalled();
    await expect(getGalleryStatus(gallery.id)).resolves.toEqual({
      status: "open",
      deletionRequestedAt: null,
    });
  });

  it("denies cross-owner deletion without touching R2", async () => {
    const gallery = await createGallery(owner);

    await expect(
      galleryQueries.deleteGalleryForOwner({
        ownerClerkId: otherOwner,
        galleryId: gallery.id,
        confirmationName: gallery.name,
      }),
    ).resolves.toEqual({ outcome: "not-found" });

    expect(deleteGalleryObjectsMock).not.toHaveBeenCalled();
    await expect(getGalleryStatus(gallery.id)).resolves.toEqual({
      status: "open",
      deletionRequestedAt: null,
    });
  });

  it("deleting transition denies guest access and upload reservations", async () => {
    const gallery = await createGallery(owner);
    deleteGalleryObjectsMock.mockResolvedValueOnce(r2Failure());

    await expect(
      galleryQueries.deleteGalleryForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        confirmationName: gallery.name,
      }),
    ).resolves.toMatchObject({ outcome: "retryable-error" });

    await expect(
      guestQueries.getGalleryForGuestSession({
        galleryId: gallery.id,
        slug: gallery.slug,
        accessVersion: gallery.accessVersion,
      }),
    ).resolves.toBeNull();
    await expect(
      guestQueries.getGalleryForIssuedUpload({
        galleryId: gallery.id,
        slug: gallery.slug,
      }),
    ).resolves.toBeNull();
    await expect(
      uploadQueries.reservePhotoUpload({
        galleryId: gallery.id,
        accessVersion: gallery.accessVersion,
        uploaderSessionHash: "a".repeat(64),
        input: {
          slug: gallery.slug,
          idempotencyKey: randomUUID(),
          mimeType: "image/jpeg",
          byteSize: 1,
          originalFilename: "blocked.jpg",
        },
        photoId: randomUUID(),
        reservationExpiresAt: new Date("2026-07-19T20:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "unavailable" });
  });

  it("removes the gallery row and cascades photos after R2 cleanup succeeds", async () => {
    const gallery = await createGallery(owner);
    const photo = await insertReadyPhoto(gallery.id);

    await expect(
      galleryQueries.deleteGalleryForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        confirmationName: gallery.name,
      }),
    ).resolves.toMatchObject({ outcome: "deleted", gallery: { id: gallery.id } });

    expect(deleteGalleryObjectsMock).toHaveBeenCalledWith({ galleryId: gallery.id });
    await expect(getGallery(gallery.id)).resolves.toBeNull();
    await expect(getPhoto(photo.id)).resolves.toBeNull();
  });

  it("leaves the gallery visible in deleting state when R2 cleanup fails", async () => {
    const gallery = await createGallery(owner);
    deleteGalleryObjectsMock.mockResolvedValueOnce(r2Failure());

    await expect(
      galleryQueries.deleteGalleryForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        confirmationName: gallery.name,
      }),
    ).resolves.toMatchObject({
      outcome: "retryable-error",
      gallery: { id: gallery.id },
      message: galleryQueries.GALLERY_DELETION_RETRY_MESSAGE,
    });

    const status = await getGalleryStatus(gallery.id);
    expect(status?.status).toBe("deleting");
    expect(status?.deletionRequestedAt).toBeInstanceOf(Date);
  });

  it("retries idempotently after a failed R2 cleanup", async () => {
    const gallery = await createGallery(owner);
    deleteGalleryObjectsMock
      .mockResolvedValueOnce(r2Failure())
      .mockResolvedValueOnce({ status: "complete" });

    await expect(
      galleryQueries.deleteGalleryForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        confirmationName: gallery.name,
      }),
    ).resolves.toMatchObject({ outcome: "retryable-error" });
    await expect(
      galleryQueries.deleteGalleryForOwner({
        ownerClerkId: owner,
        galleryId: gallery.id,
        confirmationName: gallery.name,
      }),
    ).resolves.toMatchObject({ outcome: "deleted", gallery: { id: gallery.id } });

    expect(deleteGalleryObjectsMock).toHaveBeenCalledTimes(2);
    expect(deleteGalleryObjectsMock).toHaveBeenNthCalledWith(1, {
      galleryId: gallery.id,
    });
    expect(deleteGalleryObjectsMock).toHaveBeenNthCalledWith(2, {
      galleryId: gallery.id,
    });
    await expect(getGallery(gallery.id)).resolves.toBeNull();
  });
});

async function createGallery(ownerClerkId: string) {
  const gallery = await galleryQueries.createGalleryForOwner(ownerClerkId, {
    name: `Gallery Delete ${randomUUID()}`,
    eventDate: undefined,
  });
  createdGalleryIds.push(gallery.id);
  return gallery;
}

async function insertReadyPhoto(galleryId: string) {
  const id = randomUUID();
  const photo = {
    id,
    galleryId,
    status: "ready" as const,
    idempotencyKey: randomUUID(),
    uploaderSessionHash: "b".repeat(64),
    quarantineObjectKey: `quarantine/${galleryId}/${id}`,
    declaredMimeType: "image/jpeg",
    originalFilename: "delete-gallery.jpg",
    mediaKind: "image" as const,
    originalObjectKey: `originals/${galleryId}/${id}`,
    displayObjectKey: `photos/${galleryId}/${id}/display.jpg`,
    thumbnailObjectKey: `photos/${galleryId}/${id}/thumbnail.jpg`,
    declaredByteSize: 1024,
    mimeType: "image/jpeg",
    byteSize: 2048,
    width: 800,
    height: 600,
    reservationExpiresAt: new Date("2026-07-19T18:15:00.000Z"),
    createdAt: new Date("2026-07-19T17:58:00.000Z"),
    readyAt: new Date("2026-07-19T17:59:00.000Z"),
  };
  await db.insert(photos).values(photo);
  return photo;
}

async function getGallery(galleryId: string) {
  const [gallery] = await db
    .select()
    .from(galleries)
    .where(eq(galleries.id, galleryId));
  return gallery ?? null;
}

async function getGalleryStatus(galleryId: string) {
  const [gallery] = await db
    .select({
      status: galleries.status,
      deletionRequestedAt: galleries.deletionRequestedAt,
    })
    .from(galleries)
    .where(eq(galleries.id, galleryId));

  return gallery ?? null;
}

async function getPhoto(photoId: string) {
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId));
  return photo ?? null;
}

function r2Failure() {
  return {
    status: "retryable-error" as const,
    message: "Gallery files could not be deleted. Please try again." as const,
    failure: { phase: "list" as const, prefix: "photos" as const, errorName: "R2Error" },
  };
}
