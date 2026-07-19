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
  getPhotoCompletionStateForGuest,
  markPhotoReady,
  rejectPhoto,
  renewPhotoProcessingLeaseForCompletion,
  resetPhotoToPending,
} from "./queries";
import {
  isSupportedUploadMimeType,
  isSupportedVideoMimeType,
  getMediaKindForMimeType,
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
  const existingState = await getPhotoCompletionStateForGuest({
    photoId,
    galleryId,
    uploaderSessionHash,
  });
  if (existingState.outcome === "not-found") {
    return { outcome: "not-found" };
  }
  if (existingState.outcome === "unavailable") {
    await expireUnavailableUpload(existingState.photo).catch(() => undefined);
    return { outcome: "expired" };
  }
  const existing = existingState.photo;

  if (existing.status === "ready") {
    return { outcome: "ready", photo: existing };
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
    const currentState = await getPhotoCompletionStateForGuest({
      photoId,
      galleryId,
      uploaderSessionHash,
    });

    if (currentState.outcome === "not-found") {
      return { outcome: "not-found" };
    }
    if (currentState.outcome === "unavailable") {
      await expireUnavailableUpload(currentState.photo).catch(() => undefined);
      return { outcome: "expired" };
    }
    const current = currentState.photo;

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

      const beforeOriginal = await renewCompletionReadiness({
        photo,
        processingStartedAt,
      });
      if (beforeOriginal.outcome !== "available") {
        return { outcome: beforeOriginal.outcome };
      }
      processingStartedAt = beforeOriginal.processingStartedAt;

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

      const beforeDisplay = await renewCompletionReadiness({
        photo,
        processingStartedAt,
      });
      if (beforeDisplay.outcome !== "available") {
        return { outcome: beforeDisplay.outcome };
      }
      processingStartedAt = beforeDisplay.processingStartedAt;

      await putProcessedObject({
        objectKey: displayObjectKey,
        body: processed.display,
      });

      const beforeThumbnail = await renewCompletionReadiness({
        photo,
        processingStartedAt,
      });
      if (beforeThumbnail.outcome !== "available") {
        return { outcome: beforeThumbnail.outcome };
      }
      processingStartedAt = beforeThumbnail.processingStartedAt;

      await putProcessedObject({
        objectKey: thumbnailObjectKey,
        body: processed.thumbnail,
      });

      const beforeReady = await renewCompletionReadiness({
        photo,
        processingStartedAt,
      });
      if (beforeReady.outcome !== "available") {
        return { outcome: beforeReady.outcome };
      }
      processingStartedAt = beforeReady.processingStartedAt;

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
      const beforeOriginal = await renewCompletionReadiness({
        photo,
        processingStartedAt,
      });
      if (beforeOriginal.outcome !== "available") {
        return { outcome: beforeOriginal.outcome };
      }
      processingStartedAt = beforeOriginal.processingStartedAt;

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

      const beforeReady = await renewCompletionReadiness({
        photo,
        processingStartedAt,
      });
      if (beforeReady.outcome !== "available") {
        return { outcome: beforeReady.outcome };
      }
      processingStartedAt = beforeReady.processingStartedAt;
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
        await deleteAllUploadObjects(photo).catch(() => undefined);
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
        await deleteAllUploadObjects(photo).catch(() => undefined);
      }
      return { outcome: "quota-exceeded" };
    }
    if (readyResult.outcome === "state-changed") {
      const currentState = await getPhotoCompletionStateForGuest({
        photoId,
        galleryId,
        uploaderSessionHash,
      });
      if (currentState.outcome === "not-found") {
        return { outcome: "not-found" };
      }
      if (currentState.outcome === "unavailable") {
        await abortUnavailableProcessing(photo, processingStartedAt).catch(
          () => undefined,
        );
        return { outcome: "expired" };
      }
      const current = currentState.photo;
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

    const renewed = await renewCompletionReadiness({
      photo,
      processingStartedAt,
    });
    if (renewed.outcome !== "available") {
      return { outcome: renewed.outcome };
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

async function renewCompletionReadiness({
  photo,
  processingStartedAt,
}: {
  photo: Photo;
  processingStartedAt: Date;
}): Promise<
  | { outcome: "available"; processingStartedAt: Date }
  | { outcome: "expired" }
  | { outcome: "processing" }
> {
  const renewed = await renewPhotoProcessingLeaseForCompletion({
    photoId: photo.id,
    galleryId: photo.galleryId,
    processingStartedAt,
  });

  if (renewed.outcome === "available" && renewed.photo.processingStartedAt) {
    return {
      outcome: "available",
      processingStartedAt: renewed.photo.processingStartedAt,
    };
  }
  if (renewed.outcome === "unavailable") {
    await abortUnavailableProcessing(photo, processingStartedAt).catch(
      () => undefined,
    );
    return { outcome: "expired" };
  }

  return { outcome: "processing" };
}

async function expireUnavailableUpload(photo: Photo) {
  if (photo.status !== "pending" && photo.status !== "processing") {
    return;
  }

  await abortUnavailableProcessing(
    photo,
    photo.status === "processing"
      ? (photo.processingStartedAt ?? undefined)
      : undefined,
  );
}

async function abortUnavailableProcessing(
  photo: Photo,
  processingStartedAt?: Date,
) {
  if (photo.status === "pending") {
    await rejectPhoto({
      photoId: photo.id,
      galleryId: photo.galleryId,
      allowedStatuses: ["pending"],
    }).catch(() => undefined);
  } else {
    await rejectPhoto({
      photoId: photo.id,
      galleryId: photo.galleryId,
      allowedStatuses: ["processing"],
      processingStartedAt,
    }).catch(() => undefined);
  }

  await deleteAllUploadObjects(photo).catch(() => undefined);
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

function getAllUploadObjectKeys(photo: Photo) {
  return [photo.quarantineObjectKey, ...getPreReadyObjectKeys(photo)];
}

async function deletePreReadyObjects(photo: Photo) {
  await deleteUploadObjects(getPreReadyObjectKeys(photo));
}

async function deleteAllUploadObjects(photo: Photo) {
  await deleteUploadObjects(getAllUploadObjectKeys(photo));
}

function requireObjectKey(value: string | null, label: string) {
  if (!value || value.trim().length === 0) {
    throw new InvalidUploadError(`The upload record is missing ${label}.`);
  }

  return value;
}

function isInvalidImageError(error: unknown) {
  return error instanceof Error && error.name === "InvalidImageError";
}
