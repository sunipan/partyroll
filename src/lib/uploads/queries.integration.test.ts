import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));

const owner = `partyroll-upload-test-${randomUUID()}`;
const sessionHash = "a".repeat(64);
const otherSessionHash = "b".repeat(64);
const byteSize = 2048;

let db: (typeof import("@/db"))["db"];
let galleries: (typeof import("@/db/schema"))["galleries"];
let photos: (typeof import("@/db/schema"))["photos"];
let galleryQueries: typeof import("@/lib/galleries/queries");
let uploadQueries: typeof import("./queries");
let openGalleryId = "";
let closedGalleryId = "";
let openGallerySlug = "";
let closedGallerySlug = "";

const idempotencyKey = randomUUID();

function createReservationIdentity() {
  return {
    photoId: randomUUID(),
    reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
  };
}

describe("photo upload reservations", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ galleries, photos } = await import("@/db/schema"));
    galleryQueries = await import("@/lib/galleries/queries");
    uploadQueries = await import("./queries");

    const [openGallery, closedGallery] = await Promise.all([
      galleryQueries.createGalleryForOwner(owner, {
        name: `Upload Open ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(owner, {
        name: `Upload Closed ${randomUUID()}`,
        eventDate: undefined,
      }),
    ]);
    openGalleryId = openGallery.id;
    openGallerySlug = openGallery.slug;
    closedGalleryId = closedGallery.id;
    closedGallerySlug = closedGallery.slug;

    await db
      .update(galleries)
      .set({ status: "closed" })
      .where(eq(galleries.id, closedGalleryId));
  });

  afterAll(async () => {
    if (db && galleries && openGalleryId && closedGalleryId) {
      await db
        .delete(galleries)
        .where(inArray(galleries.id, [openGalleryId, closedGalleryId]));
    }
  });

  it("reserves atomically and makes identical idempotent retries free", async () => {
    const input = {
      slug: openGallerySlug,
      idempotencyKey,
      mimeType: "image/jpeg" as const,
      byteSize,
      originalFilename: "dance-floor.jpg",
    };

    const first = await uploadQueries.reservePhotoUpload({
      galleryId: openGalleryId,
      accessVersion: 1,
      uploaderSessionHash: sessionHash,
      input,
      ...createReservationIdentity(),
    });
    const retry = await uploadQueries.reservePhotoUpload({
      galleryId: openGalleryId,
      accessVersion: 1,
      uploaderSessionHash: sessionHash,
      input,
      ...createReservationIdentity(),
    });

    expect(first.outcome).toBe("reserved");
    expect(retry.outcome).toBe("existing");
    if (first.outcome === "reserved" && retry.outcome === "existing") {
      expect(retry.photo.id).toBe(first.photo.id);

      await expect(
        uploadQueries.getUploadReservationForGuest({
          galleryId: openGalleryId,
          uploaderSessionHash: sessionHash,
          idempotencyKey,
        }),
      ).resolves.toMatchObject({ id: first.photo.id, status: "pending" });
    }

    await expect(
      uploadQueries.getUploadReservationForGuest({
        galleryId: openGalleryId,
        uploaderSessionHash: otherSessionHash,
        idempotencyKey,
      }),
    ).resolves.toBeNull();

    const [gallery] = await db
      .select()
      .from(galleries)
      .where(eq(galleries.id, openGalleryId));
    expect(gallery.reservedPhotoCount).toBe(1);
    expect(gallery.reservedBytes).toBe(byteSize);
  });

  it("rejects conflicting retries, closed galleries, and cross-session reads", async () => {
    await expect(
      uploadQueries.reservePhotoUpload({
        galleryId: openGalleryId,
        accessVersion: 1,
        uploaderSessionHash: sessionHash,
        input: {
          slug: openGallerySlug,
          idempotencyKey,
          mimeType: "image/jpeg",
          byteSize: byteSize + 1,
          originalFilename: "dance-floor.jpg",
        },
        ...createReservationIdentity(),
      }),
    ).resolves.toMatchObject({ outcome: "idempotency-conflict" });

    await expect(
      uploadQueries.reservePhotoUpload({
        galleryId: closedGalleryId,
        accessVersion: 1,
        uploaderSessionHash: sessionHash,
        input: {
          slug: closedGallerySlug,
          idempotencyKey: randomUUID(),
          mimeType: "image/jpeg",
          byteSize,
          originalFilename: "closed-gallery.jpg",
        },
        ...createReservationIdentity(),
      }),
    ).resolves.toMatchObject({ outcome: "unavailable" });

    const [photo] = await db
      .select()
      .from(photos)
      .where(eq(photos.idempotencyKey, idempotencyKey));
    await expect(
      uploadQueries.getPhotoForGuest({
        photoId: photo.id,
        galleryId: openGalleryId,
        uploaderSessionHash: otherSessionHash,
      }),
    ).resolves.toBeNull();
  });

  it("moves reserved quota to ready storage exactly once", async () => {
    const [photo] = await db
      .select()
      .from(photos)
      .where(eq(photos.idempotencyKey, idempotencyKey));

    const claimed = await uploadQueries.claimPhotoForProcessing({
      photoId: photo.id,
      galleryId: openGalleryId,
      uploaderSessionHash: sessionHash,
    });
    expect(claimed?.status).toBe("processing");

    const ready = await uploadQueries.markPhotoReady({
      photoId: photo.id,
      galleryId: openGalleryId,
      processingStartedAt: claimed!.processingStartedAt!,
      finalByteSize: 1024 + byteSize,
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
    });
    expect(ready).toMatchObject({
      outcome: "ready",
      photo: { status: "ready" },
    });

    await expect(
      uploadQueries.markPhotoReady({
        photoId: photo.id,
        galleryId: openGalleryId,
        processingStartedAt: claimed!.processingStartedAt!,
        finalByteSize: 1024 + byteSize,
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
      }),
    ).resolves.toEqual({ outcome: "state-changed" });

    const [gallery] = await db
      .select()
      .from(galleries)
      .where(eq(galleries.id, openGalleryId));
    expect(gallery.photoCount).toBe(1);
    expect(gallery.reservedPhotoCount).toBe(0);
    expect(gallery.storageBytes).toBe(1024 + byteSize);
    expect(gallery.reservedBytes).toBe(0);
  });

  it("lists ready media only for the scoped guest session or owner", async () => {
    const [photo] = await db
      .select()
      .from(photos)
      .where(eq(photos.idempotencyKey, idempotencyKey));

    const guestMedia = await uploadQueries.listReadyMediaForGuest({
      galleryId: openGalleryId,
      slug: openGallerySlug,
      accessVersion: 1,
    });
    expect(guestMedia.map((media) => media.id)).toContain(photo.id);
    expect(guestMedia.find((media) => media.id === photo.id)).toMatchObject({
      declaredByteSize: byteSize,
      byteSize: 1024 + byteSize,
    });

    await expect(
      uploadQueries.listReadyMediaForGuest({
        galleryId: openGalleryId,
        slug: closedGallerySlug,
        accessVersion: 1,
      }),
    ).resolves.toEqual([]);
    await expect(
      uploadQueries.listReadyMediaForGuest({
        galleryId: openGalleryId,
        slug: openGallerySlug,
        accessVersion: 2,
      }),
    ).resolves.toEqual([]);
    await expect(
      uploadQueries.listReadyMediaForOwner({
        ownerClerkId: `${owner}-other`,
        galleryId: openGalleryId,
      }),
    ).resolves.toEqual([]);

    const ownerMedia = await uploadQueries.listReadyMediaForOwner({
      ownerClerkId: owner,
      galleryId: openGalleryId,
    });
    expect(ownerMedia.map((media) => media.id)).toContain(photo.id);
    expect(ownerMedia.find((media) => media.id === photo.id)).toMatchObject({
      declaredByteSize: byteSize,
      byteSize: 1024 + byteSize,
    });
  });

  it(
    "deletes ready media only for its owning gallery and updates accounting once",
    async () => {
      const [deleteGallery, sameOwnerOtherGallery, otherOwnerGallery] =
        await Promise.all([
          galleryQueries.createGalleryForOwner(owner, {
            name: `Delete Media ${randomUUID()}`,
            eventDate: undefined,
          }),
          galleryQueries.createGalleryForOwner(owner, {
            name: `Delete Other ${randomUUID()}`,
            eventDate: undefined,
          }),
          galleryQueries.createGalleryForOwner(`${owner}-other`, {
            name: `Delete Other Owner ${randomUUID()}`,
            eventDate: undefined,
          }),
        ]);
      const deleteIdempotencyKey = randomUUID();
      const finalByteSize = byteSize + 512;

      try {
        const reservation = await uploadQueries.reservePhotoUpload({
          galleryId: deleteGallery.id,
          accessVersion: deleteGallery.accessVersion,
          uploaderSessionHash: sessionHash,
          input: {
            slug: deleteGallery.slug,
            idempotencyKey: deleteIdempotencyKey,
            mimeType: "image/jpeg",
            byteSize,
            originalFilename: "delete-media.jpg",
          },
          ...createReservationIdentity(),
        });
        expect(reservation.outcome).toBe("reserved");
        if (reservation.outcome !== "reserved") {
          throw new Error("Delete reservation was not created.");
        }

        const claimed = await uploadQueries.claimPhotoForProcessing({
          photoId: reservation.photo.id,
          galleryId: deleteGallery.id,
          uploaderSessionHash: sessionHash,
        });
        expect(claimed?.processingStartedAt).toBeInstanceOf(Date);

        await expect(
          uploadQueries.markPhotoReady({
            photoId: reservation.photo.id,
            galleryId: deleteGallery.id,
            processingStartedAt: claimed!.processingStartedAt!,
            finalByteSize,
            mimeType: "image/jpeg",
            width: 800,
            height: 600,
          }),
        ).resolves.toMatchObject({ outcome: "ready" });

        await expect(
          uploadQueries.deleteReadyMediaRecordForOwner({
            ownerClerkId: owner,
            galleryId: sameOwnerOtherGallery.id,
            photoId: reservation.photo.id,
          }),
        ).resolves.toBeNull();
        await expect(
          uploadQueries.deleteReadyMediaRecordForOwner({
            ownerClerkId: `${owner}-other`,
            galleryId: deleteGallery.id,
            photoId: reservation.photo.id,
          }),
        ).resolves.toBeNull();

        const deleted = await uploadQueries.deleteReadyMediaRecordForOwner({
          ownerClerkId: owner,
          galleryId: deleteGallery.id,
          photoId: reservation.photo.id,
        });
        expect(deleted?.id).toBe(reservation.photo.id);
        await expect(
          uploadQueries.deleteReadyMediaRecordForOwner({
            ownerClerkId: owner,
            galleryId: deleteGallery.id,
            photoId: reservation.photo.id,
          }),
        ).resolves.toBeNull();

        const [updatedGallery] = await db
          .select()
          .from(galleries)
          .where(eq(galleries.id, deleteGallery.id));
        const [sameOwnerOther] = await db
          .select()
          .from(galleries)
          .where(eq(galleries.id, sameOwnerOtherGallery.id));
        const [remainingPhoto] = await db
          .select()
          .from(photos)
          .where(eq(photos.id, reservation.photo.id));

        expect(remainingPhoto).toBeUndefined();
        expect(updatedGallery.photoCount).toBe(0);
        expect(updatedGallery.storageBytes).toBe(0);
        expect(updatedGallery.reservedPhotoCount).toBe(0);
        expect(updatedGallery.reservedBytes).toBe(0);
        expect(sameOwnerOther.photoCount).toBe(0);
        expect(sameOwnerOther.storageBytes).toBe(0);
      } finally {
        await db
          .delete(galleries)
          .where(
            inArray(galleries.id, [
              deleteGallery.id,
              sameOwnerOtherGallery.id,
              otherOwnerGallery.id,
            ]),
          );
      }
    },
    15_000,
  );

  it(
    "finishes issued reservations after closure or rotation but not archival",
    async () => {
      const lifecycleGallery = await galleryQueries.createGalleryForOwner(owner, {
        name: `Upload Lifecycle ${randomUUID()}`,
        eventDate: undefined,
      });
      const firstIdempotencyKey = randomUUID();
      const secondIdempotencyKey = randomUUID();

      try {
        const firstReservation = await uploadQueries.reservePhotoUpload({
          galleryId: lifecycleGallery.id,
          accessVersion: lifecycleGallery.accessVersion,
          uploaderSessionHash: sessionHash,
          input: {
            slug: lifecycleGallery.slug,
            idempotencyKey: firstIdempotencyKey,
            mimeType: "image/jpeg",
            byteSize,
            originalFilename: "first-lifecycle.jpg",
          },
          ...createReservationIdentity(),
        });
        const secondReservation = await uploadQueries.reservePhotoUpload({
          galleryId: lifecycleGallery.id,
          accessVersion: lifecycleGallery.accessVersion,
          uploaderSessionHash: sessionHash,
          input: {
            slug: lifecycleGallery.slug,
            idempotencyKey: secondIdempotencyKey,
            mimeType: "image/jpeg",
            byteSize,
            originalFilename: "second-lifecycle.jpg",
          },
          ...createReservationIdentity(),
        });

        expect(firstReservation.outcome).toBe("reserved");
        expect(secondReservation.outcome).toBe("reserved");
        if (
          firstReservation.outcome !== "reserved" ||
          secondReservation.outcome !== "reserved"
        ) {
          throw new Error("Lifecycle reservations were not created.");
        }

        const firstClaim = await uploadQueries.claimPhotoForProcessing({
          photoId: firstReservation.photo.id,
          galleryId: lifecycleGallery.id,
          uploaderSessionHash: sessionHash,
        });
        const secondClaim = await uploadQueries.claimPhotoForProcessing({
          photoId: secondReservation.photo.id,
          galleryId: lifecycleGallery.id,
          uploaderSessionHash: sessionHash,
        });
        expect(firstClaim?.processingStartedAt).toBeInstanceOf(Date);
        expect(secondClaim?.processingStartedAt).toBeInstanceOf(Date);

        await db
          .update(galleries)
          .set({
            status: "closed",
            accessVersion: lifecycleGallery.accessVersion + 1,
          })
          .where(eq(galleries.id, lifecycleGallery.id));

        await expect(
          uploadQueries.markPhotoReady({
            photoId: firstReservation.photo.id,
            galleryId: lifecycleGallery.id,
            processingStartedAt: firstClaim!.processingStartedAt!,
            finalByteSize: 1024 + byteSize,
            mimeType: "image/jpeg",
            width: 800,
            height: 600,
          }),
        ).resolves.toMatchObject({ outcome: "ready" });

        await db
          .update(galleries)
          .set({ status: "archived" })
          .where(eq(galleries.id, lifecycleGallery.id));

        await expect(
          uploadQueries.markPhotoReady({
            photoId: secondReservation.photo.id,
            galleryId: lifecycleGallery.id,
            processingStartedAt: secondClaim!.processingStartedAt!,
            finalByteSize: 1024 + byteSize,
            mimeType: "image/jpeg",
            width: 800,
            height: 600,
          }),
        ).resolves.toEqual({ outcome: "unavailable" });

        const [blockedPhoto] = await db
          .select({ status: photos.status })
          .from(photos)
          .where(eq(photos.id, secondReservation.photo.id));
        const [updatedGallery] = await db
          .select({
            photoCount: galleries.photoCount,
            reservedPhotoCount: galleries.reservedPhotoCount,
          })
          .from(galleries)
          .where(eq(galleries.id, lifecycleGallery.id));

        expect(blockedPhoto.status).toBe("processing");
        expect(updatedGallery).toEqual({
          photoCount: 1,
          reservedPhotoCount: 1,
        });
      } finally {
        await db.delete(galleries).where(eq(galleries.id, lifecycleGallery.id));
      }
    },
    15_000,
  );

  it("tracks ready-photo quarantine cleanup idempotently", async () => {
    const [photo] = await db
      .select()
      .from(photos)
      .where(eq(photos.idempotencyKey, idempotencyKey));

    const cleanupNow = new Date(
      photo.reservationExpiresAt.getTime() + 11 * 60 * 1000,
    );
    const awaitingCleanup =
      await uploadQueries.listPhotosAwaitingQuarantineCleanup({
        now: cleanupNow,
      });
    expect(awaitingCleanup.some((candidate) => candidate.id === photo.id)).toBe(true);

    await uploadQueries.markQuarantineDeleted({
      photoId: photo.id,
      galleryId: openGalleryId,
    });
    await uploadQueries.markQuarantineDeleted({
      photoId: photo.id,
      galleryId: openGalleryId,
    });

    const updated = await uploadQueries.getPhotoForGuest({
      photoId: photo.id,
      galleryId: openGalleryId,
      uploaderSessionHash: sessionHash,
    });
    const remaining =
      await uploadQueries.listPhotosAwaitingQuarantineCleanup({
        now: cleanupNow,
      });

    expect(updated?.quarantineDeletedAt).toBeInstanceOf(Date);
    expect(remaining.some((candidate) => candidate.id === photo.id)).toBe(false);
  });
});
