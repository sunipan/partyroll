import "server-only";

import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { galleries, photos, type Photo } from "@/db/schema";
import { GUEST_ACCESSIBLE_GALLERY_STATUSES } from "@/lib/galleries/rules";

import {
  getMediaKindForMimeType,
  isSupportedImageMimeType,
  MAX_GALLERY_PHOTOS,
  MAX_GALLERY_STORAGE_BYTES,
  type ReserveUploadInput,
} from "./rules";
import {
  getDisplayObjectKey,
  getOriginalObjectKey,
  getQuarantineObjectKey,
  getThumbnailObjectKey,
} from "./objects";
import {
  COMPLETION_RETRY_DELAY_MILLISECONDS,
  MEDIA_DELETION_RETRY_DELAY_MILLISECONDS,
  MAX_MEDIA_DELETION_ATTEMPTS,
  MAX_COMPLETION_ATTEMPTS,
  UPLOAD_CLEANUP_GRACE_MILLISECONDS,
  UPLOAD_WORK_LEASE_MILLISECONDS,
} from "./security-core";
import {
  createReadyMediaPage,
  decodeReadyMediaCursor,
  normalizeReadyMediaPageSize,
  type ReadyMediaCursor,
  type ReadyMediaPage,
} from "./ready-media-pagination";

export type UploadReservationResult =
  | { outcome: "reserved"; photo: Photo }
  | { outcome: "existing"; photo: Photo }
  | { outcome: "unavailable" }
  | { outcome: "quota-exceeded" }
  | { outcome: "idempotency-conflict" };

class ReservationUnavailableError extends Error {
  constructor(
    readonly outcome: "unavailable" | "quota-exceeded",
  ) {
    super(outcome);
  }
}

class FinalizationUnavailableError extends Error {
  constructor(
    readonly outcome: "unavailable" | "quota-exceeded",
  ) {
    super(outcome);
  }
}

export type MarkPhotoReadyResult =
  | { outcome: "ready"; photo: Photo }
  | { outcome: "unavailable" }
  | { outcome: "quota-exceeded" }
  | { outcome: "state-changed" };

export type MediaDeletionFailureInput = {
  photoId: string;
  galleryId: string;
  failureReason: string;
  now?: Date;
  retryAt?: Date;
};

export type UploadCleanupClaim = {
  photo: Photo;
  leaseStartedAt: Date;
};

const readyMediaColumns = {
  id: photos.id,
  galleryId: photos.galleryId,
  quarantineObjectKey: photos.quarantineObjectKey,
  originalFilename: photos.originalFilename,
  declaredMimeType: photos.declaredMimeType,
  declaredByteSize: photos.declaredByteSize,
  mediaKind: photos.mediaKind,
  mimeType: photos.mimeType,
  byteSize: photos.byteSize,
  width: photos.width,
  height: photos.height,
  originalObjectKey: photos.originalObjectKey,
  displayObjectKey: photos.displayObjectKey,
  thumbnailObjectKey: photos.thumbnailObjectKey,
  createdAt: photos.createdAt,
  readyAt: photos.readyAt,
  cursorCreatedAt: sql<string>`to_char(${photos.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};

export type ReadyMedia = Pick<
  Photo,
  | "id"
  | "galleryId"
  | "quarantineObjectKey"
  | "originalFilename"
  | "declaredMimeType"
  | "declaredByteSize"
  | "mediaKind"
  | "mimeType"
  | "byteSize"
  | "width"
  | "height"
  | "originalObjectKey"
  | "displayObjectKey"
  | "thumbnailObjectKey"
  | "createdAt"
  | "readyAt"
>;

type ReadyMediaRow = ReadyMedia & {
  cursorCreatedAt: string;
};

type ReadyMediaListInput = {
  cursor?: string;
  pageSize?: number;
};

export async function reservePhotoUpload({
  galleryId,
  accessVersion,
  uploaderSessionHash,
  input,
  photoId,
  reservationExpiresAt,
}: {
  galleryId: string;
  accessVersion: number;
  uploaderSessionHash: string;
  input: ReserveUploadInput;
  photoId: string;
  reservationExpiresAt: Date;
}): Promise<UploadReservationResult> {
  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      const mediaKind = getMediaKindForMimeType(input.mimeType);
      const [inserted] = await tx
        .insert(photos)
        .values({
          id: photoId,
          galleryId,
          idempotencyKey: input.idempotencyKey,
          uploaderSessionHash,
          quarantineObjectKey: getQuarantineObjectKey(galleryId, photoId),
          originalObjectKey: getOriginalObjectKey(galleryId, photoId),
          originalFilename: input.originalFilename,
          mediaKind,
          displayObjectKey: isSupportedImageMimeType(input.mimeType)
            ? getDisplayObjectKey(galleryId, photoId)
            : null,
          thumbnailObjectKey: isSupportedImageMimeType(input.mimeType)
            ? getThumbnailObjectKey(galleryId, photoId)
            : null,
          declaredMimeType: input.mimeType,
          declaredByteSize: input.byteSize,
          reservationExpiresAt,
        })
        .onConflictDoNothing({
          target: [
            photos.galleryId,
            photos.uploaderSessionHash,
            photos.idempotencyKey,
          ],
        })
        .returning();

      if (!inserted) {
        const [existing] = await tx
          .select()
          .from(photos)
          .where(
            and(
              eq(photos.galleryId, galleryId),
              eq(photos.uploaderSessionHash, uploaderSessionHash),
              eq(photos.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);

        if (
          !existing ||
          existing.declaredByteSize !== input.byteSize ||
          existing.declaredMimeType !== input.mimeType ||
          existing.originalFilename !== input.originalFilename
        ) {
          return { outcome: "idempotency-conflict" };
        }

        return { outcome: "existing", photo: existing };
      }

      const [gallery] = await tx
        .update(galleries)
        .set({
          reservedPhotoCount: sql`${galleries.reservedPhotoCount} + 1`,
          reservedBytes: sql`${galleries.reservedBytes} + ${input.byteSize}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(galleries.id, galleryId),
            eq(galleries.slug, input.slug),
            eq(galleries.accessVersion, accessVersion),
            eq(galleries.status, "open"),
            sql`${galleries.photoCount} + ${galleries.reservedPhotoCount} < ${MAX_GALLERY_PHOTOS}`,
            sql`${galleries.storageBytes} + ${galleries.reservedBytes} + ${input.byteSize} <= ${MAX_GALLERY_STORAGE_BYTES}`,
          ),
        )
        .returning({ id: galleries.id });

      if (!gallery) {
        const [availableGallery] = await tx
          .select({ id: galleries.id })
          .from(galleries)
          .where(
            and(
              eq(galleries.id, galleryId),
              eq(galleries.slug, input.slug),
              eq(galleries.accessVersion, accessVersion),
              eq(galleries.status, "open"),
            ),
          )
          .limit(1);

        throw new ReservationUnavailableError(
          availableGallery ? "quota-exceeded" : "unavailable",
        );
      }

      return { outcome: "reserved", photo: inserted };
    });
  } catch (error) {
    if (error instanceof ReservationUnavailableError) {
      return { outcome: error.outcome };
    }
    throw error;
  }
}

export async function getUploadReservationForGuest({
  galleryId,
  uploaderSessionHash,
  idempotencyKey,
}: {
  galleryId: string;
  uploaderSessionHash: string;
  idempotencyKey: string;
}): Promise<Photo | null> {
  const [photo] = await db
    .select()
    .from(photos)
    .where(
      and(
        eq(photos.galleryId, galleryId),
        eq(photos.uploaderSessionHash, uploaderSessionHash),
        eq(photos.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  return photo ?? null;
}

export async function getPhotoForGuest({
  photoId,
  galleryId,
  uploaderSessionHash,
}: {
  photoId: string;
  galleryId: string;
  uploaderSessionHash: string;
}): Promise<Photo | null> {
  const [photo] = await db
    .select()
    .from(photos)
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        eq(photos.uploaderSessionHash, uploaderSessionHash),
      ),
    )
    .limit(1);

  return photo ?? null;
}

export async function listReadyMediaForGuest({
  galleryId,
  slug,
  accessVersion,
  cursor,
  pageSize: requestedPageSize,
}: {
  galleryId: string;
  slug: string;
  accessVersion: number;
} & ReadyMediaListInput): Promise<ReadyMediaPage<ReadyMedia>> {
  const decodedCursor = parseReadyMediaCursor(cursor);
  if (decodedCursor === false) {
    return { items: [], nextCursor: null };
  }

  const pageSize = normalizeReadyMediaPageSize(requestedPageSize);
  const rows = await db
    .select(readyMediaColumns)
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(
      and(
        eq(photos.galleryId, galleryId),
        eq(photos.status, "ready"),
        eq(galleries.id, galleryId),
        eq(galleries.slug, slug),
        eq(galleries.accessVersion, accessVersion),
        inArray(galleries.status, [...GUEST_ACCESSIBLE_GALLERY_STATUSES]),
        ...(decodedCursor ? [getReadyMediaCursorPredicate(decodedCursor)] : []),
      ),
    )
    .orderBy(desc(photos.createdAt), desc(photos.id))
    .limit(pageSize + 1);

  return createReadyMediaResult(rows, pageSize);
}

export async function listReadyMediaForOwner({
  ownerClerkId,
  galleryId,
  cursor,
  pageSize: requestedPageSize,
}: {
  ownerClerkId: string;
  galleryId: string;
} & ReadyMediaListInput): Promise<ReadyMediaPage<ReadyMedia>> {
  const decodedCursor = parseReadyMediaCursor(cursor);
  if (decodedCursor === false) {
    return { items: [], nextCursor: null };
  }

  const pageSize = normalizeReadyMediaPageSize(requestedPageSize);
  const rows = await db
    .select(readyMediaColumns)
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(
      and(
        eq(photos.galleryId, galleryId),
        eq(photos.status, "ready"),
        eq(galleries.id, galleryId),
        eq(galleries.ownerClerkId, ownerClerkId),
        ...(decodedCursor ? [getReadyMediaCursorPredicate(decodedCursor)] : []),
      ),
    )
    .orderBy(desc(photos.createdAt), desc(photos.id))
    .limit(pageSize + 1);

  return createReadyMediaResult(rows, pageSize);
}

function parseReadyMediaCursor(cursor: string | undefined) {
  if (cursor === undefined) {
    return null;
  }

  return decodeReadyMediaCursor(cursor) ?? false;
}

function getReadyMediaCursorPredicate(cursor: ReadyMediaCursor) {
  const cursorCreatedAt = sql`${cursor.createdAt}::timestamptz`;

  return or(
    lt(photos.createdAt, cursorCreatedAt),
    and(eq(photos.createdAt, cursorCreatedAt), lt(photos.id, cursor.id)),
  )!;
}

function createReadyMediaResult(
  rows: ReadyMediaRow[],
  pageSize: number,
): ReadyMediaPage<ReadyMedia> {
  const page = createReadyMediaPage(rows, pageSize, (row) => ({
    createdAt: row.cursorCreatedAt,
    id: row.id,
  }));

  return {
    items: page.items.map(stripReadyMediaCursorCreatedAt),
    nextCursor: page.nextCursor,
  };
}

function stripReadyMediaCursorCreatedAt(row: ReadyMediaRow): ReadyMedia {
  return {
    id: row.id,
    galleryId: row.galleryId,
    quarantineObjectKey: row.quarantineObjectKey,
    originalFilename: row.originalFilename,
    declaredMimeType: row.declaredMimeType,
    declaredByteSize: row.declaredByteSize,
    mediaKind: row.mediaKind,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    originalObjectKey: row.originalObjectKey,
    displayObjectKey: row.displayObjectKey,
    thumbnailObjectKey: row.thumbnailObjectKey,
    createdAt: row.createdAt,
    readyAt: row.readyAt,
  };
}

export async function getReadyMediaForOwner({
  ownerClerkId,
  galleryId,
  photoId,
}: {
  ownerClerkId: string;
  galleryId: string;
  photoId: string;
}): Promise<ReadyMedia | null> {
  const [photo] = await db
    .select(readyMediaColumns)
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        eq(photos.status, "ready"),
        eq(galleries.id, galleryId),
        eq(galleries.ownerClerkId, ownerClerkId),
      ),
    )
    .limit(1);

  return photo ? stripReadyMediaCursorCreatedAt(photo) : null;
}

export async function claimReadyMediaDeletionForOwner({
  ownerClerkId,
  galleryId,
  photoId,
  now = new Date(),
}: {
  ownerClerkId: string;
  galleryId: string;
  photoId: string;
  now?: Date;
}): Promise<Photo | null> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ photo: photos })
      .from(photos)
      .innerJoin(galleries, eq(photos.galleryId, galleries.id))
      .where(
        and(
          eq(photos.id, photoId),
          eq(photos.galleryId, galleryId),
          eq(photos.status, "ready"),
          eq(galleries.id, galleryId),
          eq(galleries.ownerClerkId, ownerClerkId),
        ),
      )
      .limit(1)
      .for("update");

    if (!candidate) {
      return null;
    }

    const deletedStorageBytes = requireReadyByteSize(candidate.photo.byteSize);

    const [claimedPhoto] = await tx
      .update(photos)
      .set({
        status: "delete_pending",
        deletionRequestedAt: now,
        deletionAccountedAt: now,
        deletionFailedAt: null,
        deletionFailureReason: null,
        nextDeletionAttemptAt: null,
      })
      .where(
        and(
          eq(photos.id, photoId),
          eq(photos.galleryId, galleryId),
          eq(photos.status, "ready"),
        ),
      )
      .returning();

    if (!claimedPhoto) {
      return null;
    }

    await tx
      .update(galleries)
      .set({
        photoCount: sql`${galleries.photoCount} - 1`,
        storageBytes: sql`${galleries.storageBytes} - ${deletedStorageBytes}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(galleries.id, galleryId),
          eq(galleries.ownerClerkId, ownerClerkId),
        ),
      );

    return claimedPhoto;
  });
}

export async function getRetryableDeletePendingMediaForOwner({
  ownerClerkId,
  galleryId,
  photoId,
  now = new Date(),
}: {
  ownerClerkId: string;
  galleryId: string;
  photoId: string;
  now?: Date;
}): Promise<Photo | null> {
  const [photo] = await db
    .select({ photo: photos })
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        eq(photos.status, "delete_pending"),
        eq(galleries.id, galleryId),
        eq(galleries.ownerClerkId, ownerClerkId),
        or(
          isNull(photos.nextDeletionAttemptAt),
          lte(photos.nextDeletionAttemptAt, now),
        ),
      ),
    )
    .limit(1);

  return photo?.photo ?? null;
}

export async function deletePendingMediaRecord({
  galleryId,
  photoId,
}: {
  galleryId: string;
  photoId: string;
}): Promise<Photo | null> {
  const [deletedPhoto] = await db
    .delete(photos)
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        eq(photos.status, "delete_pending"),
      ),
    )
    .returning();

  return deletedPhoto ?? null;
}

export async function recordMediaDeletionFailure({
  photoId,
  galleryId,
  failureReason,
  now = new Date(),
  retryAt = getMediaDeletionRetryAt(now),
}: MediaDeletionFailureInput): Promise<Photo | null> {
  const [photo] = await db
    .update(photos)
    .set({
      deletionAttempts: sql`least(${photos.deletionAttempts} + 1, ${MAX_MEDIA_DELETION_ATTEMPTS})`,
      deletionFailedAt: now,
      deletionFailureReason: failureReason,
      nextDeletionAttemptAt: retryAt,
    })
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        eq(photos.status, "delete_pending"),
      ),
    )
    .returning();

  return photo ?? null;
}

export function getMediaDeletionRetryAt(now = new Date()) {
  return new Date(now.getTime() + MEDIA_DELETION_RETRY_DELAY_MILLISECONDS);
}

function requireReadyByteSize(byteSize: number | null) {
  if (byteSize === null || byteSize <= 0) {
    throw new Error("Ready media is missing byte size.");
  }

  return byteSize;
}

export async function claimPhotoForProcessing({
  photoId,
  galleryId,
  uploaderSessionHash,
  now = new Date(),
}: {
  photoId: string;
  galleryId: string;
  uploaderSessionHash: string;
  now?: Date;
}): Promise<Photo | null> {
  const [photo] = await db
    .update(photos)
    .set({
      status: "processing",
      processingStartedAt: now,
      completionAttempts: sql`${photos.completionAttempts} + 1`,
      nextProcessingAttemptAt: null,
    })
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        eq(photos.uploaderSessionHash, uploaderSessionHash),
        sql`${photos.reservationExpiresAt} > ${now.toISOString()}::timestamptz`,
        sql`${photos.completionAttempts} < ${MAX_COMPLETION_ATTEMPTS}`,
        or(
          and(
            eq(photos.status, "pending"),
            or(
              isNull(photos.nextProcessingAttemptAt),
              lte(photos.nextProcessingAttemptAt, now),
            ),
          ),
          and(
            eq(photos.status, "processing"),
            or(
              isNull(photos.processingStartedAt),
              lte(
                photos.processingStartedAt,
                new Date(now.getTime() - UPLOAD_WORK_LEASE_MILLISECONDS),
              ),
            ),
          ),
        ),
      ),
    )
    .returning();

  return photo ?? null;
}

export async function renewPhotoProcessingLease({
  photoId,
  galleryId,
  processingStartedAt,
  now = new Date(),
}: {
  photoId: string;
  galleryId: string;
  processingStartedAt: Date;
  now?: Date;
}): Promise<Photo | null> {
  const [photo] = await db
    .update(photos)
    .set({ processingStartedAt: now })
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        eq(photos.status, "processing"),
        eq(photos.processingStartedAt, processingStartedAt),
      ),
    )
    .returning();

  return photo ?? null;
}

export async function markPhotoReady({
  photoId,
  galleryId,
  processingStartedAt,
  finalByteSize,
  mimeType,
  width,
  height,
  now = new Date(),
}: {
  photoId: string;
  galleryId: string;
  processingStartedAt: Date;
  finalByteSize: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  now?: Date;
}): Promise<MarkPhotoReadyResult> {
  try {
    return await db.transaction(async (tx) => {
      const [photo] = await tx
        .update(photos)
        .set({
          status: "ready",
          mimeType,
          byteSize: finalByteSize,
          width: width ?? null,
          height: height ?? null,
          readyAt: now,
          processingStartedAt: null,
          nextProcessingAttemptAt: null,
        })
        .where(
          and(
            eq(photos.id, photoId),
            eq(photos.galleryId, galleryId),
            eq(photos.status, "processing"),
            eq(photos.processingStartedAt, processingStartedAt),
          ),
        )
        .returning();

      if (!photo) {
        return { outcome: "state-changed" };
      }

      const [gallery] = await tx
        .update(galleries)
        .set({
          photoCount: sql`${galleries.photoCount} + 1`,
          reservedPhotoCount: sql`${galleries.reservedPhotoCount} - 1`,
          storageBytes: sql`${galleries.storageBytes} + ${finalByteSize}`,
          reservedBytes: sql`${galleries.reservedBytes} - ${photo.declaredByteSize}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(galleries.id, galleryId),
            inArray(galleries.status, [...GUEST_ACCESSIBLE_GALLERY_STATUSES]),
            sql`${galleries.storageBytes} + ${galleries.reservedBytes} - ${photo.declaredByteSize} + ${finalByteSize} <= ${MAX_GALLERY_STORAGE_BYTES}`,
          ),
        )
        .returning({ id: galleries.id });

      if (!gallery) {
        const [availableGallery] = await tx
          .select({ id: galleries.id })
          .from(galleries)
          .where(
            and(
              eq(galleries.id, galleryId),
              inArray(galleries.status, [...GUEST_ACCESSIBLE_GALLERY_STATUSES]),
            ),
          )
          .limit(1);

        throw new FinalizationUnavailableError(
          availableGallery ? "quota-exceeded" : "unavailable",
        );
      }

      return { outcome: "ready", photo };
    });
  } catch (error) {
    if (error instanceof FinalizationUnavailableError) {
      return { outcome: error.outcome };
    }
    throw error;
  }
}

export async function rejectPhoto({
  photoId,
  galleryId,
  allowedStatuses = ["pending", "processing"],
  processingStartedAt,
  now = new Date(),
}: {
  photoId: string;
  galleryId: string;
  allowedStatuses?: Array<"pending" | "processing">;
  processingStartedAt?: Date;
  now?: Date;
}): Promise<Photo | null> {
  return db.transaction(async (tx) => {
    const [photo] = await tx
      .update(photos)
      .set({
        status: "rejected",
        rejectedAt: now,
        processingStartedAt: null,
        nextProcessingAttemptAt: null,
      })
      .where(
        and(
          eq(photos.id, photoId),
          eq(photos.galleryId, galleryId),
          inArray(photos.status, allowedStatuses),
          ...(processingStartedAt
            ? [eq(photos.processingStartedAt, processingStartedAt)]
            : []),
        ),
      )
      .returning();

    if (!photo) {
      return null;
    }

    await tx
      .update(galleries)
      .set({
        reservedPhotoCount: sql`${galleries.reservedPhotoCount} - 1`,
        reservedBytes: sql`${galleries.reservedBytes} - ${photo.declaredByteSize}`,
        updatedAt: now,
      })
      .where(eq(galleries.id, galleryId));

    return photo;
  });
}

export async function resetPhotoToPending({
  photoId,
  galleryId,
  processingStartedAt,
  now = new Date(),
}: {
  photoId: string;
  galleryId: string;
  processingStartedAt: Date;
  now?: Date;
}): Promise<Photo | null> {
  const retryAt = new Date(
    now.getTime() + COMPLETION_RETRY_DELAY_MILLISECONDS,
  );
  const [photo] = await db
    .update(photos)
    .set({
      status: "pending",
      processingStartedAt: null,
      nextProcessingAttemptAt: retryAt,
    })
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        eq(photos.status, "processing"),
        eq(photos.processingStartedAt, processingStartedAt),
      ),
    )
    .returning();

  return photo ?? null;
}

export async function markQuarantineDeleted({
  photoId,
  galleryId,
  now = new Date(),
}: {
  photoId: string;
  galleryId: string;
  now?: Date;
}) {
  await db
    .update(photos)
    .set({ quarantineDeletedAt: now })
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        inArray(photos.status, ["ready", "rejected"]),
      ),
    );
}

export async function listPhotosAwaitingQuarantineCleanup({
  now = new Date(),
  limit = 25,
}: {
  now?: Date;
  limit?: number;
} = {}): Promise<Photo[]> {
  const cleanupBefore = new Date(
    now.getTime() - UPLOAD_CLEANUP_GRACE_MILLISECONDS,
  );

  return db
    .select()
    .from(photos)
    .where(
      and(
        inArray(photos.status, ["ready", "rejected"]),
        isNull(photos.quarantineDeletedAt),
        lte(photos.reservationExpiresAt, cleanupBefore),
      ),
    )
    .limit(limit);
}

export async function claimExpiredUploadReservations({
  now = new Date(),
  limit = 25,
}: {
  now?: Date;
  limit?: number;
} = {}): Promise<UploadCleanupClaim[]> {
  const cleanupBefore = new Date(
    now.getTime() - UPLOAD_CLEANUP_GRACE_MILLISECONDS,
  );
  const leaseBefore = new Date(now.getTime() - UPLOAD_WORK_LEASE_MILLISECONDS);

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: photos.id })
      .from(photos)
      .where(
        and(
          inArray(photos.status, ["pending", "processing", "deleting"]),
          lte(photos.reservationExpiresAt, cleanupBefore),
          or(
            isNull(photos.processingStartedAt),
            lte(photos.processingStartedAt, leaseBefore),
          ),
        ),
      )
      .limit(limit)
      .for("update", { skipLocked: true });

    if (candidates.length === 0) {
      return [];
    }

    const claimed = await tx
      .update(photos)
      .set({ status: "deleting", processingStartedAt: now })
      .where(
        and(
          inArray(
            photos.id,
            candidates.map(({ id }) => id),
          ),
          inArray(photos.status, ["pending", "processing", "deleting"]),
          or(
            isNull(photos.processingStartedAt),
            lte(photos.processingStartedAt, leaseBefore),
          ),
        ),
      )
      .returning();

    return claimed.map((photo) => ({ photo, leaseStartedAt: now }));
  });
}

export async function releaseExpiredUploadCleanupClaim({
  photoId,
  galleryId,
  leaseStartedAt,
}: {
  photoId: string;
  galleryId: string;
  leaseStartedAt: Date;
}) {
  await db
    .update(photos)
    .set({ status: "pending", processingStartedAt: null })
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.galleryId, galleryId),
        eq(photos.status, "deleting"),
        eq(photos.processingStartedAt, leaseStartedAt),
      ),
    );
}

export async function rejectClaimedExpiredUpload({
  photoId,
  galleryId,
  leaseStartedAt,
  now = new Date(),
}: {
  photoId: string;
  galleryId: string;
  leaseStartedAt: Date;
  now?: Date;
}): Promise<Photo | null> {
  return db.transaction(async (tx) => {
    const [photo] = await tx
      .update(photos)
      .set({
        status: "rejected",
        rejectedAt: now,
        processingStartedAt: null,
        nextProcessingAttemptAt: null,
        quarantineDeletedAt: now,
      })
      .where(
        and(
          eq(photos.id, photoId),
          eq(photos.galleryId, galleryId),
          eq(photos.status, "deleting"),
          eq(photos.processingStartedAt, leaseStartedAt),
        ),
      )
      .returning();

    if (!photo) {
      return null;
    }

    await tx
      .update(galleries)
      .set({
        reservedPhotoCount: sql`${galleries.reservedPhotoCount} - 1`,
        reservedBytes: sql`${galleries.reservedBytes} - ${photo.declaredByteSize}`,
        updatedAt: now,
      })
      .where(eq(galleries.id, galleryId));

    return photo;
  });
}
