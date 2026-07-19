import "server-only";

import { deleteUploadObjects, getFinalUploadObjectKeys } from "./objects";
import {
  claimExpiredUploadReservations,
  listPhotosAwaitingQuarantineCleanup,
  markQuarantineDeleted,
  rejectClaimedExpiredUpload,
  releaseExpiredUploadCleanupClaim,
} from "./queries";

export type UploadCleanupRunResult = {
  expiredReservations: Awaited<ReturnType<typeof cleanupExpiredUploadReservations>>;
  quarantineObjects: Awaited<ReturnType<typeof cleanupReadyPhotoQuarantine>>;
};

export const UPLOAD_CLEANUP_RUN_LIMIT = 5_000;
export const UPLOAD_CLEANUP_CONCURRENCY = 25;

async function mapWithConcurrency<T>(
  items: T[],
  operation: (item: T) => Promise<boolean>,
) {
  const results = Array<boolean>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(UPLOAD_CLEANUP_CONCURRENCY, items.length) },
      async () => {
        while (nextIndex < items.length) {
          const index = nextIndex;
          nextIndex += 1;
          results[index] = await operation(items[index]);
        }
      },
    ),
  );

  return results;
}

export async function runUploadCleanup(
  limit = UPLOAD_CLEANUP_RUN_LIMIT,
): Promise<UploadCleanupRunResult> {
  const expiredReservations = await cleanupExpiredUploadReservations(limit);
  const remainingCapacity = Math.max(
    0,
    limit - expiredReservations.inspected,
  );
  const quarantineObjects = await cleanupReadyPhotoQuarantine(
    remainingCapacity,
  );

  return { expiredReservations, quarantineObjects };
}

export async function cleanupReadyPhotoQuarantine(
  limit = UPLOAD_CLEANUP_RUN_LIMIT,
) {
  const photosWithQuarantine = await listPhotosAwaitingQuarantineCleanup({
    limit,
  });
  const results = await mapWithConcurrency(
    photosWithQuarantine,
    async (photo) => {
      try {
        await deleteUploadObjects(
          photo.status === "rejected"
            ? [photo.quarantineObjectKey, ...getFinalUploadObjectKeys(photo)]
            : [photo.quarantineObjectKey],
        );
        await markQuarantineDeleted({
          photoId: photo.id,
          galleryId: photo.galleryId,
        });
        return true;
      } catch {
        // Keep the missing timestamp so the next cleanup pass retries deletion.
        return false;
      }
    },
  );

  return {
    inspected: photosWithQuarantine.length,
    cleaned: results.filter(Boolean).length,
  };
}

export async function cleanupExpiredUploadReservations(
  limit = UPLOAD_CLEANUP_RUN_LIMIT,
) {
  const claims = await claimExpiredUploadReservations({ limit });
  const results = await mapWithConcurrency(
    claims,
    async ({ photo, leaseStartedAt }) => {
      try {
        await deleteUploadObjects([
          photo.quarantineObjectKey,
          ...getFinalUploadObjectKeys(photo),
        ]);
        const rejected = await rejectClaimedExpiredUpload({
          photoId: photo.id,
          galleryId: photo.galleryId,
          leaseStartedAt,
        });
        return Boolean(rejected);
      } catch {
        await releaseExpiredUploadCleanupClaim({
          photoId: photo.id,
          galleryId: photo.galleryId,
          leaseStartedAt,
        }).catch(() => undefined);
        return false;
      }
    },
  );

  return {
    inspected: claims.length,
    cleaned: results.filter(Boolean).length,
  };
}
