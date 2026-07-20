import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Photo } from "@/db/schema";

vi.mock("server-only", () => ({}));
vi.mock("./image-processing", () => ({
  processUploadedImage: vi.fn(),
}));
vi.mock("./objects", () => {
  class InvalidUploadError extends Error {}

  return {
    assertOriginalObject: vi.fn(),
    copyQuarantineObjectToOriginal: vi.fn(),
    deleteUploadObjects: vi.fn(),
    getDisplayObjectKey: vi.fn(
      (galleryId: string, photoId: string) => `photos/${galleryId}/${photoId}/display.jpg`,
    ),
    getFinalUploadObjectKeys: vi.fn(
      ({
        mediaKind,
        originalObjectKey,
        displayObjectKey,
        thumbnailObjectKey,
      }: {
        mediaKind: "image" | "video" | null;
        originalObjectKey: string | null;
        displayObjectKey: string | null;
        thumbnailObjectKey: string | null;
      }) => {
        if (!originalObjectKey) {
          throw new InvalidUploadError("Missing original object key.");
        }
        if (mediaKind === "image") {
          if (!displayObjectKey || !thumbnailObjectKey) {
            throw new InvalidUploadError("Missing image object keys.");
          }
          return [originalObjectKey, displayObjectKey, thumbnailObjectKey];
        }
        if (mediaKind === "video") {
          if (displayObjectKey || thumbnailObjectKey) {
            throw new InvalidUploadError("Video has derivative object keys.");
          }
          return [originalObjectKey];
        }
        throw new InvalidUploadError("Missing media kind.");
      },
    ),
    getOriginalObjectKey: vi.fn(
      (galleryId: string, photoId: string) => `originals/${galleryId}/${photoId}`,
    ),
    getThumbnailObjectKey: vi.fn(
      (galleryId: string, photoId: string) => `photos/${galleryId}/${photoId}/thumbnail.jpg`,
    ),
    InvalidUploadError,
    putProcessedObject: vi.fn(),
    readQuarantineObject: vi.fn(),
    readQuarantineObjectPrefix: vi.fn(),
  };
});
vi.mock("./video-validation", () => ({
  validateUploadedVideo: vi.fn(),
}));
vi.mock("./queries", () => ({
  claimPhotoForProcessing: vi.fn(),
  getPhotoCompletionStateForGuest: vi.fn(),
  markPhotoReady: vi.fn(),
  rejectPhoto: vi.fn(),
  renewPhotoProcessingLeaseForCompletion: vi.fn(),
  resetPhotoToPending: vi.fn(),
}));

import { completePhotoUpload } from "./completion";
import { processUploadedImage } from "./image-processing";
import {
  assertOriginalObject,
  copyQuarantineObjectToOriginal,
  deleteUploadObjects,
  putProcessedObject,
  readQuarantineObject,
  readQuarantineObjectPrefix,
} from "./objects";
import { validateUploadedVideo } from "./video-validation";
import {
  claimPhotoForProcessing,
  getPhotoCompletionStateForGuest,
  markPhotoReady,
  rejectPhoto,
  renewPhotoProcessingLeaseForCompletion,
  resetPhotoToPending,
} from "./queries";

const processingStartedAt = new Date("2026-07-16T12:00:00.000Z");
const renewedAt = new Date("2026-07-16T12:00:01.000Z");
const thumbnailPlaceholderDataUrl = "data:image/jpeg;base64,/9j/2Q==";
const photo = {
  id: randomUUID(),
  galleryId: randomUUID(),
  status: "processing",
  idempotencyKey: randomUUID(),
  uploaderSessionHash: "a".repeat(64),
  quarantineObjectKey: `quarantine/${randomUUID()}`,
  quarantineDeletedAt: null,
  originalFilename: "dance-floor.jpg",
  originalObjectKey: `originals/${randomUUID()}`,
  displayObjectKey: `photos/${randomUUID()}/display.jpg`,
  thumbnailObjectKey: `photos/${randomUUID()}/thumbnail.jpg`,
  thumbnailPlaceholderDataUrl: null,
  declaredMimeType: "image/jpeg",
  mediaKind: "image",
  declaredByteSize: 1024,
  mimeType: null,
  byteSize: null,
  width: null,
  height: null,
  reservationExpiresAt: new Date(Date.now() + 60_000),
  processingStartedAt,
  completionAttempts: 1,
  nextProcessingAttemptAt: null,
  createdAt: new Date("2026-07-16T11:59:00.000Z"),
  readyAt: null,
  rejectedAt: null,
} as Photo;

const input = {
  photoId: photo.id,
  galleryId: photo.galleryId,
  uploaderSessionHash: photo.uploaderSessionHash,
};

describe("photo completion lease safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPhotoCompletionStateForGuest).mockResolvedValue({
      outcome: "available",
      photo,
    });
    vi.mocked(claimPhotoForProcessing).mockResolvedValue(photo);
    vi.mocked(readQuarantineObject).mockResolvedValue(Buffer.from("source"));
    vi.mocked(processUploadedImage).mockResolvedValue({
      display: Buffer.from("display"),
      thumbnail: Buffer.from("thumbnail"),
      thumbnailPlaceholderDataUrl,
      totalByteSize: 16,
      width: 800,
      height: 600,
    });
    vi.mocked(renewPhotoProcessingLeaseForCompletion).mockResolvedValue({
      outcome: "available",
      photo: {
        ...photo,
        processingStartedAt: renewedAt,
      },
    });
    vi.mocked(copyQuarantineObjectToOriginal).mockResolvedValue(undefined);
    vi.mocked(assertOriginalObject).mockResolvedValue(undefined);
    vi.mocked(readQuarantineObjectPrefix).mockResolvedValue(Buffer.from("prefix"));
    vi.mocked(validateUploadedVideo).mockReturnValue(undefined);
    vi.mocked(putProcessedObject).mockResolvedValue(undefined);
    vi.mocked(deleteUploadObjects).mockResolvedValue(undefined);
  });

  it("does not delete shared final objects after another worker wins", async () => {
    vi.mocked(markPhotoReady).mockResolvedValue({ outcome: "state-changed" });
    vi.mocked(getPhotoCompletionStateForGuest)
      .mockResolvedValueOnce({ outcome: "available", photo })
      .mockResolvedValueOnce({
        outcome: "available",
        photo: { ...photo, processingStartedAt: renewedAt },
      });

    await expect(completePhotoUpload(input)).resolves.toEqual({
      outcome: "processing",
    });

    expect(copyQuarantineObjectToOriginal).toHaveBeenCalledWith({
      quarantineObjectKey: photo.quarantineObjectKey,
      originalObjectKey: photo.originalObjectKey,
      mimeType: "image/jpeg",
      byteSize: photo.declaredByteSize,
    });
    expect(putProcessedObject).toHaveBeenCalledTimes(2);
    expect(markPhotoReady).toHaveBeenCalledWith({
      photoId: photo.id,
      galleryId: photo.galleryId,
      processingStartedAt: renewedAt,
      finalByteSize: photo.declaredByteSize + 16,
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      thumbnailPlaceholderDataUrl,
    });
    expect(deleteUploadObjects).not.toHaveBeenCalled();
  });

  it("aborts without permanent writes when deletion starts after validation", async () => {
    vi.mocked(renewPhotoProcessingLeaseForCompletion).mockResolvedValueOnce({
      outcome: "unavailable",
    });
    vi.mocked(rejectPhoto).mockResolvedValue({
      ...photo,
      status: "rejected",
      processingStartedAt: null,
    });

    await expect(completePhotoUpload(input)).resolves.toEqual({
      outcome: "expired",
    });

    expect(readQuarantineObject).toHaveBeenCalled();
    expect(processUploadedImage).toHaveBeenCalled();
    expect(copyQuarantineObjectToOriginal).not.toHaveBeenCalled();
    expect(putProcessedObject).not.toHaveBeenCalled();
    expect(markPhotoReady).not.toHaveBeenCalled();
    expect(rejectPhoto).toHaveBeenCalledWith({
      photoId: photo.id,
      galleryId: photo.galleryId,
      allowedStatuses: ["processing"],
      processingStartedAt,
    });
    expect(deleteUploadObjects).toHaveBeenCalledWith([
      photo.quarantineObjectKey,
      photo.originalObjectKey,
      photo.displayObjectKey,
      photo.thumbnailObjectKey,
    ]);
  });

  it("removes partial permanent assets when deletion starts before mark-ready", async () => {
    const firstRenewedAt = new Date("2026-07-16T12:00:01.000Z");
    const secondRenewedAt = new Date("2026-07-16T12:00:02.000Z");
    const thirdRenewedAt = new Date("2026-07-16T12:00:03.000Z");
    vi.mocked(renewPhotoProcessingLeaseForCompletion)
      .mockResolvedValueOnce({
        outcome: "available",
        photo: { ...photo, processingStartedAt: firstRenewedAt },
      })
      .mockResolvedValueOnce({
        outcome: "available",
        photo: { ...photo, processingStartedAt: secondRenewedAt },
      })
      .mockResolvedValueOnce({
        outcome: "available",
        photo: { ...photo, processingStartedAt: thirdRenewedAt },
      })
      .mockResolvedValueOnce({ outcome: "unavailable" });
    vi.mocked(rejectPhoto).mockResolvedValue({
      ...photo,
      status: "rejected",
      processingStartedAt: null,
    });

    await expect(completePhotoUpload(input)).resolves.toEqual({
      outcome: "expired",
    });

    expect(copyQuarantineObjectToOriginal).toHaveBeenCalledTimes(1);
    expect(putProcessedObject).toHaveBeenCalledTimes(2);
    expect(markPhotoReady).not.toHaveBeenCalled();
    expect(rejectPhoto).toHaveBeenCalledWith({
      photoId: photo.id,
      galleryId: photo.galleryId,
      allowedStatuses: ["processing"],
      processingStartedAt: thirdRenewedAt,
    });
    expect(deleteUploadObjects).toHaveBeenCalledWith([
      photo.quarantineObjectKey,
      photo.originalObjectKey,
      photo.displayObjectKey,
      photo.thumbnailObjectKey,
    ]);
  });

  it("expires completion for deleting media without creating ready assets", async () => {
    const deletingPhoto = {
      ...photo,
      status: "deleting",
    } as Photo;
    vi.mocked(getPhotoCompletionStateForGuest).mockResolvedValueOnce({
      outcome: "unavailable",
      photo: deletingPhoto,
    });

    await expect(completePhotoUpload(input)).resolves.toEqual({
      outcome: "expired",
    });

    expect(claimPhotoForProcessing).not.toHaveBeenCalled();
    expect(readQuarantineObject).not.toHaveBeenCalled();
    expect(copyQuarantineObjectToOriginal).not.toHaveBeenCalled();
    expect(putProcessedObject).not.toHaveBeenCalled();
    expect(markPhotoReady).not.toHaveBeenCalled();
    expect(deleteUploadObjects).not.toHaveBeenCalled();
  });

  it("cleans partial final objects before releasing a transient retry", async () => {
    vi.mocked(readQuarantineObject).mockRejectedValueOnce(
      new Error("Temporary R2 failure"),
    );
    vi.mocked(resetPhotoToPending).mockResolvedValue({
      ...photo,
      status: "pending",
      processingStartedAt: null,
    });

    await expect(completePhotoUpload(input)).resolves.toEqual({
      outcome: "retryable",
    });

    expect(deleteUploadObjects).toHaveBeenCalledWith([
      photo.originalObjectKey,
      photo.displayObjectKey,
      photo.thumbnailObjectKey,
    ]);
    expect(resetPhotoToPending).toHaveBeenCalledWith({
      photoId: photo.id,
      galleryId: photo.galleryId,
      processingStartedAt: renewedAt,
    });
    expect(
      vi.mocked(deleteUploadObjects).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(resetPhotoToPending).mock.invocationCallOrder[0]);
  });

  it("rejects incomplete current media metadata without deriving object keys", async () => {
    const incompletePhoto = {
      ...photo,
      originalObjectKey: null,
    } as unknown as Photo;
    vi.mocked(getPhotoCompletionStateForGuest).mockResolvedValue({
      outcome: "available",
      photo: incompletePhoto,
    });
    vi.mocked(claimPhotoForProcessing).mockResolvedValue(incompletePhoto);
    vi.mocked(rejectPhoto).mockResolvedValue(incompletePhoto);

    await expect(completePhotoUpload(input)).resolves.toEqual({
      outcome: "invalid",
    });

    expect(readQuarantineObject).not.toHaveBeenCalled();
    expect(copyQuarantineObjectToOriginal).not.toHaveBeenCalled();
    expect(putProcessedObject).not.toHaveBeenCalled();
    expect(deleteUploadObjects).not.toHaveBeenCalled();
  });

  it("validates videos by prefix and stores only the permanent original", async () => {
    const videoPhoto = {
      ...photo,
      mediaKind: "video",
      declaredMimeType: "video/mp4",
      originalObjectKey: `originals/${randomUUID()}`,
      displayObjectKey: null,
      thumbnailObjectKey: null,
      width: null,
      height: null,
    } as Photo;
    vi.mocked(getPhotoCompletionStateForGuest).mockResolvedValue({
      outcome: "available",
      photo: videoPhoto,
    });
    vi.mocked(claimPhotoForProcessing).mockResolvedValue(videoPhoto);
    vi.mocked(renewPhotoProcessingLeaseForCompletion).mockResolvedValue({
      outcome: "available",
      photo: {
        ...videoPhoto,
        processingStartedAt: renewedAt,
      },
    });
    vi.mocked(markPhotoReady).mockResolvedValue({
      outcome: "ready",
      photo: { ...videoPhoto, status: "ready" } as Photo,
    });

    await expect(completePhotoUpload(input)).resolves.toMatchObject({
      outcome: "ready",
    });

    expect(readQuarantineObject).not.toHaveBeenCalled();
    expect(readQuarantineObjectPrefix).toHaveBeenCalledWith(
      videoPhoto.quarantineObjectKey,
      videoPhoto.declaredByteSize,
      "video/mp4",
      512 * 1024,
    );
    expect(validateUploadedVideo).toHaveBeenCalledWith({
      prefix: Buffer.from("prefix"),
      mimeType: "video/mp4",
      byteSize: videoPhoto.declaredByteSize,
    });
    expect(copyQuarantineObjectToOriginal).toHaveBeenCalledWith({
      quarantineObjectKey: videoPhoto.quarantineObjectKey,
      originalObjectKey: videoPhoto.originalObjectKey,
      mimeType: "video/mp4",
      byteSize: videoPhoto.declaredByteSize,
    });
    expect(assertOriginalObject).toHaveBeenCalledWith({
      objectKey: videoPhoto.originalObjectKey,
      expectedByteSize: videoPhoto.declaredByteSize,
      expectedMimeType: "video/mp4",
    });
    expect(putProcessedObject).not.toHaveBeenCalled();
    expect(markPhotoReady).toHaveBeenCalledWith({
      photoId: videoPhoto.id,
      galleryId: videoPhoto.galleryId,
      processingStartedAt: renewedAt,
      finalByteSize: videoPhoto.declaredByteSize,
      mimeType: "video/mp4",
      thumbnailPlaceholderDataUrl: null,
    });
  });
});
