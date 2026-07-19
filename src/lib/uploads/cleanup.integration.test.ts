import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));
vi.mock("./objects", () => ({
  deleteUploadObjects: vi.fn(),
  getFinalUploadObjectKeys: ({
    mediaKind,
    originalObjectKey,
    displayObjectKey,
    thumbnailObjectKey,
  }: {
    mediaKind: "image" | "video";
    originalObjectKey: string;
    displayObjectKey: string | null;
    thumbnailObjectKey: string | null;
  }) => [
    originalObjectKey,
    ...(mediaKind === "image" ? [displayObjectKey, thumbnailObjectKey] : []),
  ],
  getDisplayObjectKey: (galleryId: string, photoId: string) =>
    `photos/${galleryId}/${photoId}/display.jpg`,
  getOriginalObjectKey: (galleryId: string, photoId: string) =>
    `originals/${galleryId}/${photoId}`,
  getQuarantineObjectKey: (galleryId: string, photoId: string) =>
    `quarantine/${galleryId}/${photoId}`,
  getThumbnailObjectKey: (galleryId: string, photoId: string) =>
    `photos/${galleryId}/${photoId}/thumbnail.jpg`,
}));

import { galleries, photos } from "@/db/schema";

import { deleteUploadObjects } from "./objects";
import {
  UPLOAD_CLEANUP_GRACE_MILLISECONDS,
  UPLOAD_WORK_LEASE_MILLISECONDS,
} from "./security-core";

const owner = `partyroll-cleanup-test-${randomUUID()}`;
const sessionHash = "c".repeat(64);
const declaredByteSize = 2048;

let db: (typeof import("@/db"))["db"];
let galleryQueries: typeof import("@/lib/galleries/queries");
let uploadQueries: typeof import("./queries");
let cleanupExpiredUploadReservations: (typeof import("./cleanup"))["cleanupExpiredUploadReservations"];
let cleanupReadyPhotoQuarantine: (typeof import("./cleanup"))["cleanupReadyPhotoQuarantine"];
const createdGalleryIds: string[] = [];

function expiredAt(now = new Date()) {
  return new Date(now.getTime() - UPLOAD_CLEANUP_GRACE_MILLISECONDS - 1_000);
}

function retryableLeaseStartedAt(now: Date) {
  return new Date(now.getTime() - UPLOAD_WORK_LEASE_MILLISECONDS - 1_000);
}

async function createGallery() {
  const gallery = await galleryQueries.createGalleryForOwner(owner, {
    name: `Cleanup ${randomUUID()}`,
    eventDate: undefined,
  });
  createdGalleryIds.push(gallery.id);
  return gallery;
}

async function reserveExpiredPhoto({
  gallery,
  byteSize = declaredByteSize,
  reservationExpiresAt = expiredAt(),
}: {
  gallery: Awaited<ReturnType<typeof createGallery>>;
  byteSize?: number;
  reservationExpiresAt?: Date;
}) {
  const photoId = randomUUID();
  const reservation = await uploadQueries.reservePhotoUpload({
    galleryId: gallery.id,
    accessVersion: gallery.accessVersion,
    uploaderSessionHash: sessionHash,
      input: {
        slug: gallery.slug,
        idempotencyKey: randomUUID(),
        mimeType: "image/jpeg",
        byteSize,
        originalFilename: "cleanup.jpg",
      },
    photoId,
    reservationExpiresAt,
  });

  expect(reservation.outcome).toBe("reserved");
  if (reservation.outcome !== "reserved") {
    throw new Error("Upload reservation was not created.");
  }

  return reservation.photo;
}

describe("expired upload reservation cleanup", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    galleryQueries = await import("@/lib/galleries/queries");
    uploadQueries = await import("./queries");
    ({ cleanupExpiredUploadReservations, cleanupReadyPhotoQuarantine } =
      await import("./cleanup"));
  });

  beforeEach(() => {
    vi.mocked(deleteUploadObjects).mockReset();
  });

  afterEach(async () => {
    if (db && createdGalleryIds.length > 0) {
      await db.delete(galleries).where(inArray(galleries.id, createdGalleryIds));
      createdGalleryIds.length = 0;
    }
  });

  afterAll(async () => {
    if (db && createdGalleryIds.length > 0) {
      await db.delete(galleries).where(inArray(galleries.id, createdGalleryIds));
    }
  });

  it(
    "claims only expired reservations with stale leases and respects the batch limit",
    async () => {
      const now = new Date("2026-07-18T20:00:00.000Z");
      const gallery = await createGallery();
      const eligiblePending = await reserveExpiredPhoto({
        gallery,
        reservationExpiresAt: expiredAt(now),
      });
      const eligibleProcessing = await reserveExpiredPhoto({
        gallery,
        reservationExpiresAt: expiredAt(now),
      });
      const eligibleDeleting = await reserveExpiredPhoto({
        gallery,
        reservationExpiresAt: expiredAt(now),
      });
      const graceProtected = await reserveExpiredPhoto({
        gallery,
        reservationExpiresAt: new Date(
          now.getTime() - UPLOAD_CLEANUP_GRACE_MILLISECONDS + 1_000,
        ),
      });
      const activeProcessing = await reserveExpiredPhoto({
        gallery,
        reservationExpiresAt: expiredAt(now),
      });
      const activeDeleting = await reserveExpiredPhoto({
        gallery,
        reservationExpiresAt: expiredAt(now),
      });
      const unexpired = await reserveExpiredPhoto({
        gallery,
        reservationExpiresAt: new Date(now.getTime() + 60_000),
      });
      await db
        .update(photos)
        .set({
          status: "processing",
          processingStartedAt: retryableLeaseStartedAt(now),
        })
        .where(eq(photos.id, eligibleProcessing.id));
      await db
        .update(photos)
        .set({
          status: "deleting",
          processingStartedAt: retryableLeaseStartedAt(now),
        })
        .where(eq(photos.id, eligibleDeleting.id));
      await db
        .update(photos)
        .set({
          status: "processing",
          processingStartedAt: new Date(
            now.getTime() - UPLOAD_WORK_LEASE_MILLISECONDS + 1_000,
          ),
        })
        .where(eq(photos.id, activeProcessing.id));
      await db
        .update(photos)
        .set({
          status: "deleting",
          processingStartedAt: new Date(
            now.getTime() - UPLOAD_WORK_LEASE_MILLISECONDS + 1_000,
          ),
        })
        .where(eq(photos.id, activeDeleting.id));
      const eligibleIds = [
        eligiblePending.id,
        eligibleProcessing.id,
        eligibleDeleting.id,
      ];
      const firstClaims = await uploadQueries.claimExpiredUploadReservations({
        now,
        limit: 2,
      });
      const secondClaims = await uploadQueries.claimExpiredUploadReservations({
        now,
        limit: 1,
      });

      expect(firstClaims).toHaveLength(2);
      expect(firstClaims.every(({ photo }) => eligibleIds.includes(photo.id))).toBe(
        true,
      );
      expect(secondClaims).toHaveLength(1);
      expect(secondClaims.every(({ photo }) => eligibleIds.includes(photo.id))).toBe(
        true,
      );
      expect([
        ...firstClaims.map(({ photo }) => photo.id),
        ...secondClaims.map(({ photo }) => photo.id),
      ].sort()).toEqual(eligibleIds.sort());

      const rows = await db
        .select({
          id: photos.id,
          status: photos.status,
          processingStartedAt: photos.processingStartedAt,
        })
        .from(photos)
        .where(
          inArray(photos.id, [
            ...eligibleIds,
            graceProtected.id,
            activeProcessing.id,
            activeDeleting.id,
            unexpired.id,
          ]),
        );
      const byId = new Map(rows.map((row) => [row.id, row]));

      for (const id of eligibleIds) {
        expect(byId.get(id)).toMatchObject({
          status: "deleting",
          processingStartedAt: now,
        });
      }
      expect(byId.get(graceProtected.id)?.status).toBe("pending");
      expect(byId.get(activeProcessing.id)?.status).toBe("processing");
      expect(byId.get(activeDeleting.id)).toMatchObject({
        status: "deleting",
        processingStartedAt: new Date(
          now.getTime() - UPLOAD_WORK_LEASE_MILLISECONDS + 1_000,
        ),
      });
      expect(byId.get(unexpired.id)?.status).toBe("pending");
    },
    15_000,
  );

  it(
    "deletes quarantine objects, rejects expired reservations, and converges reserved accounting",
    async () => {
      const gallery = await createGallery();
      const firstPhoto = await reserveExpiredPhoto({
        gallery,
        byteSize: declaredByteSize,
      });
      const secondPhoto = await reserveExpiredPhoto({
        gallery,
        byteSize: declaredByteSize + 512,
      });
      vi.mocked(deleteUploadObjects).mockResolvedValue(undefined);

      await expect(cleanupExpiredUploadReservations(2)).resolves.toEqual({
        inspected: 2,
        cleaned: 2,
      });

      expect(deleteUploadObjects).toHaveBeenCalledWith([
        firstPhoto.quarantineObjectKey,
        firstPhoto.originalObjectKey,
        firstPhoto.displayObjectKey,
        firstPhoto.thumbnailObjectKey,
      ]);
      expect(deleteUploadObjects).toHaveBeenCalledWith([
        secondPhoto.quarantineObjectKey,
        secondPhoto.originalObjectKey,
        secondPhoto.displayObjectKey,
        secondPhoto.thumbnailObjectKey,
      ]);

      const [updatedGallery] = await db
        .select()
        .from(galleries)
        .where(eq(galleries.id, gallery.id));
      const updatedPhotos = await db
        .select()
        .from(photos)
        .where(inArray(photos.id, [firstPhoto.id, secondPhoto.id]));

      expect(updatedGallery.reservedPhotoCount).toBe(0);
      expect(updatedGallery.reservedBytes).toBe(0);
      expect(updatedPhotos).toHaveLength(2);
      expect(updatedPhotos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: firstPhoto.id,
            status: "rejected",
            processingStartedAt: null,
            nextProcessingAttemptAt: null,
            quarantineDeletedAt: null,
          }),
          expect.objectContaining({
            id: secondPhoto.id,
            status: "rejected",
            processingStartedAt: null,
            nextProcessingAttemptAt: null,
            quarantineDeletedAt: null,
          }),
        ]),
      );
    },
    15_000,
  );

  it(
    "keeps rejected expired uploads eligible for late signed PUT cleanup",
    async () => {
      const gallery = await createGallery();
      const photo = await reserveExpiredPhoto({ gallery });
      vi.mocked(deleteUploadObjects).mockResolvedValue(undefined);

      await expect(cleanupExpiredUploadReservations(1)).resolves.toEqual({
        inspected: 1,
        cleaned: 1,
      });

      const [rejectedPhoto] = await db
        .select()
        .from(photos)
        .where(eq(photos.id, photo.id));
      expect(rejectedPhoto).toMatchObject({
        status: "rejected",
        quarantineDeletedAt: null,
      });

      vi.mocked(deleteUploadObjects).mockClear();
      vi.mocked(deleteUploadObjects).mockResolvedValue(undefined);

      await expect(cleanupReadyPhotoQuarantine(1)).resolves.toEqual({
        inspected: 1,
        cleaned: 1,
      });
      expect(deleteUploadObjects).toHaveBeenCalledWith([
        photo.quarantineObjectKey,
        photo.originalObjectKey,
        photo.displayObjectKey,
        photo.thumbnailObjectKey,
      ]);

      const [cleanedPhoto] = await db
        .select()
        .from(photos)
        .where(eq(photos.id, photo.id));
      expect(cleanedPhoto).toMatchObject({
        status: "rejected",
        quarantineDeletedAt: expect.any(Date),
      });
    },
    15_000,
  );

  it(
    "releases failed R2 deletion claims so a later cleanup run can retry",
    async () => {
      const gallery = await createGallery();
      const photo = await reserveExpiredPhoto({ gallery });
      vi.mocked(deleteUploadObjects)
        .mockRejectedValueOnce(new Error("R2 deletion failed"))
        .mockResolvedValueOnce(undefined);

      await expect(cleanupExpiredUploadReservations(1)).resolves.toEqual({
        inspected: 1,
        cleaned: 0,
      });

      const [releasedPhoto] = await db
        .select()
        .from(photos)
        .where(eq(photos.id, photo.id));
      const [reservedGallery] = await db
        .select()
        .from(galleries)
        .where(eq(galleries.id, gallery.id));
      expect(releasedPhoto).toMatchObject({
        status: "pending",
        processingStartedAt: null,
        quarantineDeletedAt: null,
      });
      expect(reservedGallery.reservedPhotoCount).toBe(1);
      expect(reservedGallery.reservedBytes).toBe(declaredByteSize);

      await expect(cleanupExpiredUploadReservations(1)).resolves.toEqual({
        inspected: 1,
        cleaned: 1,
      });

      const [retriedPhoto] = await db
        .select()
        .from(photos)
        .where(eq(photos.id, photo.id));
      const [cleanedGallery] = await db
        .select()
        .from(galleries)
        .where(eq(galleries.id, gallery.id));
      expect(deleteUploadObjects).toHaveBeenCalledTimes(2);
      expect(retriedPhoto).toMatchObject({
        status: "rejected",
        processingStartedAt: null,
        nextProcessingAttemptAt: null,
        quarantineDeletedAt: null,
      });
      expect(cleanedGallery.reservedPhotoCount).toBe(0);
      expect(cleanedGallery.reservedBytes).toBe(0);
    },
    15_000,
  );
});
