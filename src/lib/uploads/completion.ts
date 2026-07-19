import "server-only";

import type { Photo } from "@/db/schema";

import { validateUploadedVideo } from "./video-validation";
import { processUploadedImage } from "./image-processing";
import {
  assertOriginalObject,
  copyQuarantineObjectToOriginal,
  deleteUploadObjects,
  getFinalUploadObjectKeys,
  InvalidUploadError,
  putProcessedObject,
  readQuarantineObject,
  readQuarantineObjectPrefix,
} from "./objects";
import {
  claimPhotoForProcessing,
  getPhotoForGuest,
  markPhotoReady,
  rejectPhoto,
  renewPhotoProcessingLease,
  resetPhotoToPending,
} from "./queries";
import {
  isSupportedImageMimeType,
  isSupportedVideoMimeType,
  getMediaKindForMimeType,
  type SupportedUploadMimeType,
} from "./rules";
import {
  MAX_COMPLETION_ATTEMPTS,
  UPLOAD_WORK_LEASE_MILLISECONDS,
} from "./security-core";

const MAX_VIDEO_VALIDATION_BYTES = 512 * 1024;

export type CompletePhotoResult =
  | { outcome: "ready"; photo: Photo }
  | { outcome: "invalid" }
  | { outcome: "expired" }
  | { outcome: "processing" }
  | { outcome: "not-found" }
  | { outcome: "quota-exceeded" }
  | { outcome: "retryable" };

export async function completePhotoUpload({
  photoId,
  galleryId,
  uploaderSessionHash,
}: {
  photoId: string;
  galleryId: string;
  uploaderSessionHash: string;
}): Promise<CompletePhotoResult> {
  const existing = await getPhotoForGuest({
    photoId,
    galleryId,
    uploaderSessionHash,
  });
  if (!existing) {
    return { outcome: "not-found" };
  }
  if (existing.status === "ready") {
    return { outcome: "ready", photo: existing };
  }
  if (
    existing.status === "rejected" ||
    existing.status === "deleting" ||
    existing.status === "delete_pending"
  ) {
    return { outcome: "expired" };
  }
  const now = new Date();
  if (existing.reservationExpiresAt <= now) {
    const rejected = await rejectPhoto({
      photoId,
      galleryId,
      allowedStatuses: ["pending"],
    });
    return { outcome: rejected ? "expired" : "processing" };
  }

  const photo = await claimPhotoForProcessing({
    photoId,
    galleryId,
    uploaderSessionHash,
  });
  if (!photo) {
    const current = await getPhotoForGuest({
      photoId,
      galleryId,
      uploaderSessionHash,
    });
    if (!current) {
      return { outcome: "not-found" };
    }

    const currentTime = new Date();
    const processingLeaseExpired =
      current.status === "processing" &&
      current.processingStartedAt !== null &&
      current.processingStartedAt.getTime() <=
        currentTime.getTime() - UPLOAD_WORK_LEASE_MILLISECONDS;
    const terminalPending =
      current.status === "pending" &&
      (current.reservationExpiresAt <= currentTime ||
        current.completionAttempts >= MAX_COMPLETION_ATTEMPTS);
    const terminalProcessing =
      processingLeaseExpired &&
      current.completionAttempts >= MAX_COMPLETION_ATTEMPTS;

    if (terminalPending || terminalProcessing) {
      const allowedStatus: "pending" | "processing" = terminalPending
        ? "pending"
        : "processing";
      const rejected = await rejectPhoto({
        photoId,
        galleryId,
        allowedStatuses: [allowedStatus],
        processingStartedAt:
          allowedStatus === "processing"
            ? (current.processingStartedAt ?? undefined)
            : undefined,
      });
      if (rejected) {
        await deletePreReadyObjects(current).catch(() => undefined);
        return { outcome: "expired" };
      }
    }

    if (
      current.status === "pending" ||
      current.status === "processing"
    ) {
      return { outcome: "processing" };
    }
    return { outcome: "expired" };
  }

  let processingStartedAt = photo.processingStartedAt!;

  try {
    if (!photo.declaredMimeType) {
      throw new InvalidUploadError("The upload record is incomplete.");
    }
    if (!isSupportedUploadMimeType(photo.declaredMimeType)) {
      throw new InvalidUploadError("The upload type is unsupported.");
    }
    if (!photo.originalFilename?.trim() || photo.declaredByteSize <= 0) {
      throw new InvalidUploadError("The upload record is incomplete.");
    }
    const mediaKind = getMediaKindForMimeType(photo.declaredMimeType);
    if (photo.mediaKind !== mediaKind) {
      throw new InvalidUploadError("The upload media metadata is inconsistent.");
    }
    const originalObjectKey = requireObjectKey(
      photo.originalObjectKey,
      "original object key",
    );

    let readyInput: {
      finalByteSize: number;
      mimeType: string;
      width?: number | null;
      height?: number | null;
    };

    if (mediaKind === "image") {
      const displayObjectKey = requireObjectKey(
        photo.displayObjectKey,
        "display object key",
      );
      const thumbnailObjectKey = requireObjectKey(
        photo.thumbnailObjectKey,
        "thumbnail object key",
      );
      const source = await readQuarantineObject(
        photo.quarantineObjectKey,
        photo.declaredByteSize,
        photo.declaredMimeType,
      );
      const processed = await processUploadedImage(source);

      await copyQuarantineObjectToOriginal({
        quarantineObjectKey: photo.quarantineObjectKey,
        originalObjectKey,
        mimeType: photo.declaredMimeType,
        byteSize: photo.declaredByteSize,
      });
      await assertOriginalObject({
        objectKey: originalObjectKey,
        expectedByteSize: photo.declaredByteSize,
        expectedMimeType: photo.declaredMimeType,
      });

      const renewed = await renewPhotoProcessingLease({
        photoId,
        galleryId,
        processingStartedAt,
      });
      if (!renewed?.processingStartedAt) {
        return { outcome: "processing" };
      }
      processingStartedAt = renewed.processingStartedAt;

      await putProcessedObject({
        objectKey: displayObjectKey,
        body: processed.display,
      });
      await putProcessedObject({
        objectKey: thumbnailObjectKey,
        body: processed.thumbnail,
      });
      readyInput = {
        finalByteSize: photo.declaredByteSize + processed.totalByteSize,
        mimeType: photo.declaredMimeType,
        width: processed.width,
        height: processed.height,
      };
    } else if (mediaKind === "video") {
      if (!isSupportedVideoMimeType(photo.declaredMimeType)) {
        throw new InvalidUploadError("The upload type is unsupported.");
      }
      if (
        photo.displayObjectKey !== null ||
        photo.thumbnailObjectKey !== null ||
        photo.width !== null ||
        photo.height !== null
      ) {
        throw new InvalidUploadError("Video uploads must remain original-only.");
      }
      const prefix = await readQuarantineObjectPrefix(
        photo.quarantineObjectKey,
        photo.declaredByteSize,
        photo.declaredMimeType,
        MAX_VIDEO_VALIDATION_BYTES,
      );
      validateUploadedVideo({
        prefix,
        mimeType: photo.declaredMimeType,
        byteSize: photo.declaredByteSize,
      });
      await copyQuarantineObjectToOriginal({
        quarantineObjectKey: photo.quarantineObjectKey,
        originalObjectKey,
        mimeType: photo.declaredMimeType,
        byteSize: photo.declaredByteSize,
      });
      await assertOriginalObject({
        objectKey: originalObjectKey,
        expectedByteSize: photo.declaredByteSize,
        expectedMimeType: photo.declaredMimeType,
      });

      const renewed = await renewPhotoProcessingLease({
        photoId,
        galleryId,
        processingStartedAt,
      });
      if (!renewed?.processingStartedAt) {
        return { outcome: "processing" };
      }
      processingStartedAt = renewed.processingStartedAt;
      readyInput = {
        finalByteSize: photo.declaredByteSize,
        mimeType: photo.declaredMimeType,
      };
    } else {
      throw new InvalidUploadError("The upload type is unsupported.");
    }

    const readyResult = await markPhotoReady({
      photoId,
      galleryId,
      processingStartedAt,
      ...readyInput,
    });
    if (readyResult.outcome === "unavailable") {
      const rejected = await rejectPhoto({
        photoId,
        galleryId,
        allowedStatuses: ["processing"],
        processingStartedAt,
      });
      if (rejected) {
        await deletePreReadyObjects(photo).catch(() => undefined);
      }
      return { outcome: "expired" };
    }
    if (readyResult.outcome === "quota-exceeded") {
      const rejected = await rejectPhoto({
        photoId,
        galleryId,
        allowedStatuses: ["processing"],
        processingStartedAt,
      });
      if (rejected) {
        await deletePreReadyObjects(photo).catch(() => undefined);
      }
      return { outcome: "quota-exceeded" };
    }
    if (readyResult.outcome === "state-changed") {
      const current = await getPhotoForGuest({
        photoId,
        galleryId,
        uploaderSessionHash,
      });
      if (current?.status === "ready") {
        return { outcome: "ready", photo: current };
      }
      if (current?.status === "pending" || current?.status === "processing") {
        return { outcome: "processing" };
      }
      return { outcome: current ? "expired" : "not-found" };
    }

    return { outcome: "ready", photo: readyResult.photo };
  } catch (error) {
    if (error instanceof InvalidUploadError || isInvalidImageError(error)) {
      const rejected = await rejectPhoto({
        photoId,
        galleryId,
        allowedStatuses: ["processing"],
        processingStartedAt,
      });
      if (rejected) {
        await deletePreReadyObjects(photo).catch(() => undefined);
      }
      return { outcome: "invalid" };
    }

    const renewed = await renewPhotoProcessingLease({
      photoId,
      galleryId,
      processingStartedAt,
    });
    if (!renewed?.processingStartedAt) {
      return { outcome: "processing" };
    }
    processingStartedAt = renewed.processingStartedAt;

    await deletePreReadyObjects(photo).catch(() => undefined);
    const pending = await resetPhotoToPending({
      photoId,
      galleryId,
      processingStartedAt,
    });
    return { outcome: pending ? "retryable" : "processing" };
  }
}

function getPreReadyObjectKeys(photo: Photo) {
  return getFinalUploadObjectKeys({
    id: photo.id,
    galleryId: photo.galleryId,
    mediaKind: photo.mediaKind,
    originalObjectKey: photo.originalObjectKey,
    displayObjectKey: photo.displayObjectKey,
    thumbnailObjectKey: photo.thumbnailObjectKey,
  });
}

async function deletePreReadyObjects(photo: Photo) {
  await deleteUploadObjects(getPreReadyObjectKeys(photo));
}

function requireObjectKey(value: string | null, label: string) {
  if (!value || value.trim().length === 0) {
    throw new InvalidUploadError(`The upload record is missing ${label}.`);
  }

  return value;
}

function isSupportedUploadMimeType(
  mimeType: string,
): mimeType is SupportedUploadMimeType {
  return isSupportedImageMimeType(mimeType) || isSupportedVideoMimeType(mimeType);
}

function isInvalidImageError(error: unknown) {
  return error instanceof Error && error.name === "InvalidImageError";
}
