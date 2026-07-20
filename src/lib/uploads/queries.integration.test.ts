import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));
vi.mock("./objects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./objects")>();

  return {
    ...actual,
    assertOriginalObject: vi.fn(),
    copyQuarantineObjectToOriginal: vi.fn(),
    deleteUploadObjects: vi.fn(),
    putProcessedObject: vi.fn(),
    readQuarantineObject: vi.fn(),
  };
});

const owner = `partyroll-upload-test-${randomUUID()}`;
const sessionHash = "a".repeat(64);
const otherSessionHash = "b".repeat(64);
const byteSize = 2048;
const thumbnailPlaceholderDataUrl = "data:image/jpeg;base64,/9j/2Q==";

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

function createOrderedUuidFactory() {
  const prefix = randomUUID().slice(0, 24);

  return (sequence: number) => `${prefix}${sequence.toString(16).padStart(12, "0")}`;
}

function photoFixture({
  id = randomUUID(),
  galleryId,
  status = "ready",
  createdAt,
  mediaKind = "image",
  thumbnailPlaceholderDataUrl: placeholderDataUrl = null,
}: {
  id?: string;
  galleryId: string;
  status?: "ready" | "pending";
  createdAt: Date;
  mediaKind?: "image" | "video";
  thumbnailPlaceholderDataUrl?: string | null;
}) {
  const final = status === "ready";
  const image = mediaKind === "image";

  return {
    id,
    galleryId,
    status,
    idempotencyKey: randomUUID(),
    uploaderSessionHash: sessionHash,
    quarantineObjectKey: `quarantine/${galleryId}/${id}`,
    declaredMimeType: image ? "image/jpeg" : "video/mp4",
    originalFilename: `${id}.${image ? "jpg" : "mp4"}`,
    mediaKind,
    originalObjectKey: `assets/${galleryId}/${id}/original.${image ? "jpg" : "mp4"}`,
    displayObjectKey: image ? `assets/${galleryId}/${id}/display.jpg` : null,
    thumbnailObjectKey: image
      ? `assets/${galleryId}/${id}/thumbnail.jpg`
      : null,
    thumbnailPlaceholderDataUrl:
      final && image ? placeholderDataUrl : null,
    declaredByteSize: byteSize,
    mimeType: final ? (image ? "image/jpeg" : "video/mp4") : null,
    byteSize: final ? byteSize : null,
    width: final && image ? 800 : null,
    height: final && image ? 600 : null,
    reservationExpiresAt: new Date("2026-07-18T12:30:00.000Z"),
    createdAt,
    readyAt: final ? new Date(createdAt.getTime() + 60_000) : null,
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
    if (first.outcome === "reserved") {
      expect(first.photo.thumbnailPlaceholderDataUrl).toBeNull();
    }
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
      thumbnailPlaceholderDataUrl,
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
        thumbnailPlaceholderDataUrl,
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
    const [persistedPhoto] = await db
      .select({
        status: photos.status,
        thumbnailPlaceholderDataUrl: photos.thumbnailPlaceholderDataUrl,
      })
      .from(photos)
      .where(eq(photos.id, photo.id));
    expect(persistedPhoto).toEqual({
      status: "ready",
      thumbnailPlaceholderDataUrl,
    });
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
    expect(guestMedia.items.map((media) => media.id)).toContain(photo.id);
    expect(guestMedia.items.find((media) => media.id === photo.id)).toMatchObject({
      declaredByteSize: byteSize,
      byteSize: 1024 + byteSize,
    });

    await expect(
      uploadQueries.listReadyMediaForGuest({
        galleryId: openGalleryId,
        slug: closedGallerySlug,
        accessVersion: 1,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(
      uploadQueries.listReadyMediaForGuest({
        galleryId: openGalleryId,
        slug: openGallerySlug,
        accessVersion: 2,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(
      uploadQueries.listReadyMediaForOwner({
        ownerClerkId: `${owner}-other`,
        galleryId: openGalleryId,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    const ownerMedia = await uploadQueries.listReadyMediaForOwner({
      ownerClerkId: owner,
      galleryId: openGalleryId,
    });
    expect(ownerMedia.items.map((media) => media.id)).toContain(photo.id);
    expect(ownerMedia.items.find((media) => media.id === photo.id)).toMatchObject({
      declaredByteSize: byteSize,
      byteSize: 1024 + byteSize,
    });
  });

  it("paginates ready media deterministically without duplicates or skipped rows", async () => {
    const [
      pageGallery,
      emptyGallery,
      otherOwnerGallery,
      archivedGallery,
      deletingGallery,
    ] = await Promise.all([
      galleryQueries.createGalleryForOwner(owner, {
        name: `Pagination ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(owner, {
        name: `Pagination Empty ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(`${owner}-pagination-other`, {
        name: `Pagination Other ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(owner, {
        name: `Pagination Archived ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(owner, {
        name: `Pagination Deleting ${randomUUID()}`,
        eventDate: undefined,
      }),
    ]);
    const orderedUuid = createOrderedUuidFactory();
    const newestId = orderedUuid(5);
    const tieHighId = orderedUuid(3);
    const tieLowId = orderedUuid(2);
    const oldestId = orderedUuid(1);
    const pendingId = orderedUuid(6);
    const otherOwnerId = orderedUuid(7);
    const archivedId = orderedUuid(8);
    const deletingGalleryReadyId = orderedUuid(9);

    try {
      await db
        .update(galleries)
        .set({ status: "archived" })
        .where(eq(galleries.id, archivedGallery.id));
      await db
        .update(galleries)
        .set({ status: "deleting", deletionRequestedAt: new Date() })
        .where(eq(galleries.id, deletingGallery.id));

      await db.insert(photos).values([
        photoFixture({
          id: newestId,
          galleryId: pageGallery.id,
          createdAt: new Date("2026-07-18T12:03:00.000Z"),
        }),
        photoFixture({
          id: tieHighId,
          galleryId: pageGallery.id,
          createdAt: new Date("2026-07-18T12:02:00.000Z"),
          thumbnailPlaceholderDataUrl,
        }),
        photoFixture({
          id: tieLowId,
          galleryId: pageGallery.id,
          createdAt: new Date("2026-07-18T12:02:00.000Z"),
          mediaKind: "video",
        }),
        photoFixture({
          id: oldestId,
          galleryId: pageGallery.id,
          createdAt: new Date("2026-07-18T12:01:00.000Z"),
        }),
        photoFixture({
          id: pendingId,
          galleryId: pageGallery.id,
          status: "pending",
          createdAt: new Date("2026-07-18T12:04:00.000Z"),
        }),
        photoFixture({
          id: otherOwnerId,
          galleryId: otherOwnerGallery.id,
          createdAt: new Date("2026-07-18T12:05:00.000Z"),
        }),
        photoFixture({
          id: archivedId,
          galleryId: archivedGallery.id,
          createdAt: new Date("2026-07-18T12:06:00.000Z"),
        }),
        photoFixture({
          id: deletingGalleryReadyId,
          galleryId: deletingGallery.id,
          createdAt: new Date("2026-07-18T12:07:00.000Z"),
        }),
      ]);
      const [legacyReadyPhoto] = await db
        .select({
          thumbnailPlaceholderDataUrl: photos.thumbnailPlaceholderDataUrl,
        })
        .from(photos)
        .where(eq(photos.id, newestId));
      expect(legacyReadyPhoto.thumbnailPlaceholderDataUrl).toBeNull();

      const firstGuestPage = await uploadQueries.listReadyMediaForGuest({
        galleryId: pageGallery.id,
        slug: pageGallery.slug,
        accessVersion: pageGallery.accessVersion,
        pageSize: 2,
      });
      const secondGuestPage = await uploadQueries.listReadyMediaForGuest({
        galleryId: pageGallery.id,
        slug: pageGallery.slug,
        accessVersion: pageGallery.accessVersion,
        cursor: firstGuestPage.nextCursor ?? undefined,
        pageSize: 2,
      });
      const allGuestIds = [
        ...firstGuestPage.items.map((media) => media.id),
        ...secondGuestPage.items.map((media) => media.id),
      ];

      expect(firstGuestPage.items.map((media) => media.id)).toEqual([
        newestId,
        tieHighId,
      ]);
      expect(firstGuestPage.items).toEqual([
        expect.objectContaining({
          id: newestId,
          thumbnailPlaceholderDataUrl: null,
        }),
        expect.objectContaining({
          id: tieHighId,
          thumbnailPlaceholderDataUrl,
        }),
      ]);
      expect(secondGuestPage.items.map((media) => media.id)).toEqual([
        tieLowId,
        oldestId,
      ]);
      expect(secondGuestPage.items[0]).toMatchObject({
        id: tieLowId,
        mediaKind: "video",
        thumbnailPlaceholderDataUrl: null,
      });
      expect(secondGuestPage.nextCursor).toBeNull();
      expect(new Set(allGuestIds).size).toBe(allGuestIds.length);
      expect(allGuestIds).toEqual([newestId, tieHighId, tieLowId, oldestId]);
      expect(allGuestIds).not.toContain(pendingId);
      expect(allGuestIds).not.toContain(otherOwnerId);
      expect(allGuestIds).not.toContain(archivedId);

      await expect(
        uploadQueries.listReadyMediaForGuest({
          galleryId: pageGallery.id,
          slug: pageGallery.slug,
          accessVersion: pageGallery.accessVersion + 1,
          pageSize: 2,
        }),
      ).resolves.toEqual({ items: [], nextCursor: null });
      await expect(
        uploadQueries.listReadyMediaForGuest({
          galleryId: archivedGallery.id,
          slug: archivedGallery.slug,
          accessVersion: archivedGallery.accessVersion,
          pageSize: 2,
        }),
      ).resolves.toEqual({ items: [], nextCursor: null });
      await expect(
        uploadQueries.listReadyMediaForGuest({
          galleryId: deletingGallery.id,
          slug: deletingGallery.slug,
          accessVersion: deletingGallery.accessVersion,
          pageSize: 2,
        }),
      ).resolves.toEqual({ items: [], nextCursor: null });
      await expect(
        uploadQueries.listReadyMediaForGuest({
          galleryId: emptyGallery.id,
          slug: emptyGallery.slug,
          accessVersion: emptyGallery.accessVersion,
          pageSize: 2,
        }),
      ).resolves.toEqual({ items: [], nextCursor: null });
      await expect(
        uploadQueries.listReadyMediaForGuest({
          galleryId: pageGallery.id,
          slug: pageGallery.slug,
          accessVersion: pageGallery.accessVersion,
          cursor: "invalid-cursor",
          pageSize: 2,
        }),
      ).resolves.toEqual({ items: [], nextCursor: null });

      const firstOwnerPage = await uploadQueries.listReadyMediaForOwner({
        ownerClerkId: owner,
        galleryId: pageGallery.id,
        pageSize: 2,
      });
      const secondOwnerPage = await uploadQueries.listReadyMediaForOwner({
        ownerClerkId: owner,
        galleryId: pageGallery.id,
        cursor: firstOwnerPage.nextCursor ?? undefined,
        pageSize: 2,
      });

      expect([
        ...firstOwnerPage.items.map((media) => media.id),
        ...secondOwnerPage.items.map((media) => media.id),
      ]).toEqual([newestId, tieHighId, tieLowId, oldestId]);
      expect(firstOwnerPage.items).toEqual([
        expect.objectContaining({
          id: newestId,
          thumbnailPlaceholderDataUrl: null,
        }),
        expect.objectContaining({
          id: tieHighId,
          thumbnailPlaceholderDataUrl,
        }),
      ]);
      expect(secondOwnerPage.items[0]).toMatchObject({
        id: tieLowId,
        mediaKind: "video",
        thumbnailPlaceholderDataUrl: null,
      });
      await expect(
        uploadQueries.listReadyMediaForOwner({
          ownerClerkId: owner,
          galleryId: deletingGallery.id,
          pageSize: 2,
        }),
      ).resolves.toMatchObject({
        items: [expect.objectContaining({ id: deletingGalleryReadyId })],
        nextCursor: null,
      });
      await expect(
        uploadQueries.listReadyMediaForOwner({
          ownerClerkId: `${owner}-other`,
          galleryId: pageGallery.id,
          pageSize: 2,
        }),
      ).resolves.toEqual({ items: [], nextCursor: null });
    } finally {
      await db.delete(galleries).where(
        inArray(galleries.id, [
          pageGallery.id,
          emptyGallery.id,
          otherOwnerGallery.id,
          archivedGallery.id,
          deletingGallery.id,
        ]),
      );
    }
  }, 15_000);

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
            thumbnailPlaceholderDataUrl:
              "data:image/jpeg;base64," + "A".repeat(2048),
          }),
        ).rejects.toThrow();
        const [unchangedPhoto] = await db
          .select({
            status: photos.status,
            thumbnailPlaceholderDataUrl: photos.thumbnailPlaceholderDataUrl,
          })
          .from(photos)
          .where(eq(photos.id, firstReservation.photo.id));
        expect(unchangedPhoto).toEqual({
          status: "processing",
          thumbnailPlaceholderDataUrl: null,
        });

        await expect(
          uploadQueries.markPhotoReady({
            photoId: firstReservation.photo.id,
            galleryId: lifecycleGallery.id,
            processingStartedAt: firstClaim!.processingStartedAt!,
            finalByteSize: 1024 + byteSize,
            mimeType: "image/jpeg",
            width: 800,
            height: 600,
            thumbnailPlaceholderDataUrl,
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
            thumbnailPlaceholderDataUrl,
          }),
        ).resolves.toEqual({ outcome: "unavailable" });

        const [blockedPhoto] = await db
          .select({
            status: photos.status,
            thumbnailPlaceholderDataUrl: photos.thumbnailPlaceholderDataUrl,
          })
          .from(photos)
          .where(eq(photos.id, secondReservation.photo.id));
        const [updatedGallery] = await db
          .select({
            photoCount: galleries.photoCount,
            reservedPhotoCount: galleries.reservedPhotoCount,
          })
          .from(galleries)
          .where(eq(galleries.id, lifecycleGallery.id));

        expect(blockedPhoto).toEqual({
          status: "processing",
          thumbnailPlaceholderDataUrl: null,
        });
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

  it("keeps video placeholders null through finalization", async () => {
    const gallery = await galleryQueries.createGalleryForOwner(owner, {
      name: `Video Placeholder ${randomUUID()}`,
      eventDate: undefined,
    });

    try {
      const reservation = await uploadQueries.reservePhotoUpload({
        galleryId: gallery.id,
        accessVersion: gallery.accessVersion,
        uploaderSessionHash: sessionHash,
        input: {
          slug: gallery.slug,
          idempotencyKey: randomUUID(),
          mimeType: "video/mp4",
          byteSize,
          originalFilename: "first-dance.mp4",
        },
        ...createReservationIdentity(),
      });
      expect(reservation.outcome).toBe("reserved");
      if (reservation.outcome !== "reserved") {
        throw new Error("Video reservation was not created.");
      }
      expect(reservation.photo.thumbnailPlaceholderDataUrl).toBeNull();

      const claimed = await uploadQueries.claimPhotoForProcessing({
        photoId: reservation.photo.id,
        galleryId: gallery.id,
        uploaderSessionHash: sessionHash,
      });
      expect(claimed?.processingStartedAt).toBeInstanceOf(Date);

      const ready = await uploadQueries.markPhotoReady({
        photoId: reservation.photo.id,
        galleryId: gallery.id,
        processingStartedAt: claimed!.processingStartedAt!,
        finalByteSize: byteSize,
        mimeType: "video/mp4",
        thumbnailPlaceholderDataUrl: null,
      });
      expect(ready).toMatchObject({
        outcome: "ready",
        photo: {
          mediaKind: "video",
          thumbnailPlaceholderDataUrl: null,
        },
      });

      const [updatedGallery] = await db
        .select({ storageBytes: galleries.storageBytes })
        .from(galleries)
        .where(eq(galleries.id, gallery.id));
      expect(updatedGallery.storageBytes).toBe(byteSize);
    } finally {
      await db.delete(galleries).where(eq(galleries.id, gallery.id));
    }
  });

  it(
    "denies new reservations and finalization once a gallery is deleting",
    async () => {
      const deletingGallery = await galleryQueries.createGalleryForOwner(owner, {
        name: `Upload Deleting ${randomUUID()}`,
        eventDate: undefined,
      });
      const reservedBeforeDeleting = await uploadQueries.reservePhotoUpload({
        galleryId: deletingGallery.id,
        accessVersion: deletingGallery.accessVersion,
        uploaderSessionHash: sessionHash,
        input: {
          slug: deletingGallery.slug,
          idempotencyKey: randomUUID(),
          mimeType: "image/jpeg",
          byteSize,
          originalFilename: "before-deleting.jpg",
        },
        ...createReservationIdentity(),
      });
      const pendingBeforeDeleting = await uploadQueries.reservePhotoUpload({
        galleryId: deletingGallery.id,
        accessVersion: deletingGallery.accessVersion,
        uploaderSessionHash: sessionHash,
        input: {
          slug: deletingGallery.slug,
          idempotencyKey: randomUUID(),
          mimeType: "image/jpeg",
          byteSize,
          originalFilename: "pending-before-deleting.jpg",
        },
        ...createReservationIdentity(),
      });

      try {
        expect(reservedBeforeDeleting.outcome).toBe("reserved");
        expect(pendingBeforeDeleting.outcome).toBe("reserved");
        if (
          reservedBeforeDeleting.outcome !== "reserved" ||
          pendingBeforeDeleting.outcome !== "reserved"
        ) {
          throw new Error("Deleting lifecycle reservation was not created.");
        }

        const claim = await uploadQueries.claimPhotoForProcessing({
          photoId: reservedBeforeDeleting.photo.id,
          galleryId: deletingGallery.id,
          uploaderSessionHash: sessionHash,
        });
        expect(claim?.processingStartedAt).toBeInstanceOf(Date);

        await db
          .update(galleries)
          .set({ status: "deleting", deletionRequestedAt: new Date() })
          .where(eq(galleries.id, deletingGallery.id));

        await expect(
          uploadQueries.reservePhotoUpload({
            galleryId: deletingGallery.id,
            accessVersion: deletingGallery.accessVersion,
            uploaderSessionHash: sessionHash,
            input: {
              slug: deletingGallery.slug,
              idempotencyKey: randomUUID(),
              mimeType: "image/jpeg",
              byteSize,
              originalFilename: "after-deleting.jpg",
            },
            ...createReservationIdentity(),
          }),
        ).resolves.toEqual({ outcome: "unavailable" });
        await expect(
          uploadQueries.claimPhotoForProcessing({
            photoId: pendingBeforeDeleting.photo.id,
            galleryId: deletingGallery.id,
            uploaderSessionHash: sessionHash,
          }),
        ).resolves.toBeNull();
        await expect(
          uploadQueries.getPhotoCompletionStateForGuest({
            photoId: pendingBeforeDeleting.photo.id,
            galleryId: deletingGallery.id,
            uploaderSessionHash: sessionHash,
          }),
        ).resolves.toMatchObject({
          outcome: "unavailable",
          photo: { id: pendingBeforeDeleting.photo.id, status: "pending" },
        });
        await expect(
          uploadQueries.markPhotoReady({
            photoId: reservedBeforeDeleting.photo.id,
            galleryId: deletingGallery.id,
            processingStartedAt: claim!.processingStartedAt!,
            finalByteSize: byteSize,
            mimeType: "image/jpeg",
            width: 800,
            height: 600,
            thumbnailPlaceholderDataUrl,
          }),
        ).resolves.toEqual({ outcome: "unavailable" });
      } finally {
        await db.delete(galleries).where(eq(galleries.id, deletingGallery.id));
      }
    },
    15_000,
  );

  it(
    "does not underflow or resurrect accounting after an upload is deletion-expired",
    async () => {
      const gallery = await galleryQueries.createGalleryForOwner(owner, {
        name: `Upload No Underflow ${randomUUID()}`,
        eventDate: undefined,
      });
      const reservation = await uploadQueries.reservePhotoUpload({
        galleryId: gallery.id,
        accessVersion: gallery.accessVersion,
        uploaderSessionHash: sessionHash,
        input: {
          slug: gallery.slug,
          idempotencyKey: randomUUID(),
          mimeType: "image/jpeg",
          byteSize,
          originalFilename: "no-underflow.jpg",
        },
        ...createReservationIdentity(),
      });

      try {
        expect(reservation.outcome).toBe("reserved");
        if (reservation.outcome !== "reserved") {
          throw new Error("Underflow reservation was not created.");
        }

        const claim = await uploadQueries.claimPhotoForProcessing({
          photoId: reservation.photo.id,
          galleryId: gallery.id,
          uploaderSessionHash: sessionHash,
        });
        expect(claim?.processingStartedAt).toBeInstanceOf(Date);

        await db
          .update(galleries)
          .set({ reservedPhotoCount: 0, reservedBytes: 0 })
          .where(eq(galleries.id, gallery.id));

        await expect(
          uploadQueries.rejectPhoto({
            photoId: reservation.photo.id,
            galleryId: gallery.id,
            allowedStatuses: ["processing"],
            processingStartedAt: claim!.processingStartedAt!,
          }),
        ).resolves.toMatchObject({ id: reservation.photo.id, status: "rejected" });
        await expect(
          uploadQueries.markPhotoReady({
            photoId: reservation.photo.id,
            galleryId: gallery.id,
            processingStartedAt: claim!.processingStartedAt!,
            finalByteSize: byteSize,
            mimeType: "image/jpeg",
            width: 800,
            height: 600,
            thumbnailPlaceholderDataUrl,
          }),
        ).resolves.toEqual({ outcome: "state-changed" });

        const [updatedGallery] = await db
          .select({
            photoCount: galleries.photoCount,
            reservedPhotoCount: galleries.reservedPhotoCount,
            storageBytes: galleries.storageBytes,
            reservedBytes: galleries.reservedBytes,
          })
          .from(galleries)
          .where(eq(galleries.id, gallery.id));
        const [updatedPhoto] = await db
          .select({ status: photos.status, readyAt: photos.readyAt })
          .from(photos)
          .where(eq(photos.id, reservation.photo.id));

        expect(updatedGallery).toEqual({
          photoCount: 0,
          reservedPhotoCount: 0,
          storageBytes: 0,
          reservedBytes: 0,
        });
        expect(updatedPhoto).toEqual({ status: "rejected", readyAt: null });
      } finally {
        await db.delete(galleries).where(eq(galleries.id, gallery.id));
      }
    },
    15_000,
  );

  it(
    "refuses to finalize a new image without a valid thumbnail placeholder",
    async () => {
      const gallery = await galleryQueries.createGalleryForOwner(owner, {
        name: `Upload Placeholder Required ${randomUUID()}`,
        eventDate: undefined,
      });
      const reservation = await uploadQueries.reservePhotoUpload({
        galleryId: gallery.id,
        accessVersion: gallery.accessVersion,
        uploaderSessionHash: sessionHash,
        input: {
          slug: gallery.slug,
          idempotencyKey: randomUUID(),
          mimeType: "image/jpeg",
          byteSize,
          originalFilename: "missing-placeholder.jpg",
        },
        ...createReservationIdentity(),
      });

      try {
        expect(reservation.outcome).toBe("reserved");
        if (reservation.outcome !== "reserved") {
          throw new Error("Placeholder reservation was not created.");
        }

        const claim = await uploadQueries.claimPhotoForProcessing({
          photoId: reservation.photo.id,
          galleryId: gallery.id,
          uploaderSessionHash: sessionHash,
        });
        expect(claim?.processingStartedAt).toBeInstanceOf(Date);

        await expect(
          uploadQueries.markPhotoReady({
            photoId: reservation.photo.id,
            galleryId: gallery.id,
            processingStartedAt: claim!.processingStartedAt!,
            finalByteSize: byteSize,
            mimeType: "image/jpeg",
            width: 800,
            height: 600,
            thumbnailPlaceholderDataUrl: null,
          }),
        ).rejects.toThrow("valid thumbnail placeholder");

        const [persistedPhoto] = await db
          .select({
            status: photos.status,
            thumbnailPlaceholderDataUrl: photos.thumbnailPlaceholderDataUrl,
          })
          .from(photos)
          .where(eq(photos.id, reservation.photo.id));
        expect(persistedPhoto).toEqual({
          status: "processing",
          thumbnailPlaceholderDataUrl: null,
        });
      } finally {
        await db.delete(galleries).where(eq(galleries.id, gallery.id));
      }
    },
    15_000,
  );

  it(
    "carries a real Sharp placeholder through completion, persistence, views, and UI",
    async () => {
      const [completion, objects, media, galleryViewer] = await Promise.all([
        import("./completion"),
        import("./objects"),
        import("./media"),
        import("@/components/gallery/media-viewer"),
      ]);
      const source = await sharp({
        create: {
          width: 96,
          height: 72,
          channels: 3,
          background: { r: 222, g: 71, b: 46 },
        },
      })
        .jpeg({ quality: 85 })
        .toBuffer();
      vi.mocked(objects.readQuarantineObject).mockResolvedValue(source);

      const gallery = await galleryQueries.createGalleryForOwner(owner, {
        name: `Upload Completion Integration ${randomUUID()}`,
        eventDate: undefined,
      });
      const photoId = randomUUID();
      const reservation = await uploadQueries.reservePhotoUpload({
        galleryId: gallery.id,
        accessVersion: gallery.accessVersion,
        uploaderSessionHash: sessionHash,
        input: {
          slug: gallery.slug,
          idempotencyKey: randomUUID(),
          mimeType: "image/jpeg",
          byteSize: source.byteLength,
          originalFilename: "sharp-placeholder-integration.jpg",
        },
        photoId,
        reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      try {
        expect(reservation.outcome).toBe("reserved");

        const result = await completion.completePhotoUpload({
          photoId,
          galleryId: gallery.id,
          uploaderSessionHash: sessionHash,
        });
        expect(result.outcome).toBe("ready");
        if (result.outcome !== "ready") {
          throw new Error("Real image completion did not become ready.");
        }

        const placeholder = result.photo.thumbnailPlaceholderDataUrl;
        expect(placeholder).toMatch(
          /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/,
        );
        expect(placeholder!.length).toBeLessThanOrEqual(2048);

        const [persistedPhoto] = await db
          .select({
            thumbnailPlaceholderDataUrl: photos.thumbnailPlaceholderDataUrl,
          })
          .from(photos)
          .where(eq(photos.id, photoId));
        expect(persistedPhoto.thumbnailPlaceholderDataUrl).toBe(placeholder);

        const [guestPage, ownerPage] = await Promise.all([
          media.listReadyMediaForGuestGallery({
            galleryId: gallery.id,
            slug: gallery.slug,
            accessVersion: gallery.accessVersion,
          }),
          media.listReadyMediaForOwnerGallery({
            ownerClerkId: owner,
            galleryId: gallery.id,
          }),
        ]);
        const guestItem = guestPage.items.find((item) => item.id === photoId);
        const ownerItem = ownerPage.items.find((item) => item.id === photoId);
        expect(guestItem?.thumbnailPlaceholderDataUrl).toBe(placeholder);
        expect(ownerItem?.thumbnailPlaceholderDataUrl).toBe(placeholder);

        for (const item of [guestItem, ownerItem]) {
          expect(item).toBeDefined();
          const html = renderToStaticMarkup(
            createElement(galleryViewer.GalleryMediaViewer, {
              items: [item!],
            }),
          );
          expect(html).toContain(placeholder!);
          expect(html).toContain("blur-md");
          expect(html).toContain("opacity-0");
          expect(html).toContain("motion-reduce:transition-none");
          expect(html.indexOf(placeholder!)).toBeLessThan(
            html.indexOf(item!.thumbnailUrl!),
          );
        }
      } finally {
        await db.delete(galleries).where(eq(galleries.id, gallery.id));
      }
    },
    30_000,
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
