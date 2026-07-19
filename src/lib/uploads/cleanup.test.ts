import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Photo } from "@/db/schema";

vi.mock("server-only", () => ({}));
vi.mock("./objects", () => ({
  deleteUploadObjects: vi.fn(),
  getFinalUploadObjectKeys: vi.fn(
    ({
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
  ),
}));
vi.mock("./queries", () => ({
  claimExpiredUploadReservations: vi.fn(),
  listPhotosAwaitingQuarantineCleanup: vi.fn(),
  markQuarantineDeleted: vi.fn(),
  rejectClaimedExpiredUpload: vi.fn(),
  releaseExpiredUploadCleanupClaim: vi.fn(),
}));

import {
  cleanupReadyPhotoQuarantine,
  UPLOAD_CLEANUP_CONCURRENCY,
  UPLOAD_CLEANUP_RUN_LIMIT,
} from "./cleanup";
import { deleteUploadObjects } from "./objects";
import {
  listPhotosAwaitingQuarantineCleanup,
  markQuarantineDeleted,
} from "./queries";

const readyPhoto = {
  id: randomUUID(),
  galleryId: randomUUID(),
  status: "ready",
  quarantineObjectKey: `quarantine/${randomUUID()}`,
  mediaKind: "image",
  originalObjectKey: `originals/${randomUUID()}`,
  displayObjectKey: `photos/${randomUUID()}/display.jpg`,
  thumbnailObjectKey: `photos/${randomUUID()}/thumbnail.jpg`,
} as Photo;

const rejectedPhoto = {
  ...readyPhoto,
  id: randomUUID(),
  status: "rejected",
} as Photo;

describe("ready photo quarantine cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPhotosAwaitingQuarantineCleanup).mockResolvedValue([
      readyPhoto,
    ]);
  });

  it("keeps cleanup pending when R2 deletion fails", async () => {
    vi.mocked(deleteUploadObjects).mockRejectedValueOnce(
      new Error("R2 deletion failed"),
    );

    await expect(cleanupReadyPhotoQuarantine()).resolves.toEqual({
      inspected: 1,
      cleaned: 0,
    });
    expect(markQuarantineDeleted).not.toHaveBeenCalled();
  });

  it("marks cleanup complete after a later successful retry", async () => {
    vi.mocked(deleteUploadObjects).mockResolvedValueOnce(undefined);
    vi.mocked(markQuarantineDeleted).mockResolvedValueOnce(undefined);

    await expect(cleanupReadyPhotoQuarantine()).resolves.toEqual({
      inspected: 1,
      cleaned: 1,
    });
    expect(deleteUploadObjects).toHaveBeenCalledWith([
      readyPhoto.quarantineObjectKey,
    ]);
    expect(markQuarantineDeleted).toHaveBeenCalledWith({
      photoId: readyPhoto.id,
      galleryId: readyPhoto.galleryId,
    });
  });

  it("drains a large batch without exceeding bounded concurrency", async () => {
    const photos = Array.from({ length: 30 }, (_, index) => ({
      ...readyPhoto,
      id: randomUUID(),
      quarantineObjectKey: `quarantine/${index}-${randomUUID()}`,
    }));
    let activeDeletions = 0;
    let peakDeletions = 0;

    vi.mocked(listPhotosAwaitingQuarantineCleanup).mockResolvedValueOnce(photos);
    vi.mocked(deleteUploadObjects).mockImplementation(async () => {
      activeDeletions += 1;
      peakDeletions = Math.max(peakDeletions, activeDeletions);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeDeletions -= 1;
    });
    vi.mocked(markQuarantineDeleted).mockResolvedValue(undefined);

    await expect(cleanupReadyPhotoQuarantine()).resolves.toEqual({
      inspected: photos.length,
      cleaned: photos.length,
    });
    expect(listPhotosAwaitingQuarantineCleanup).toHaveBeenCalledWith({
      limit: UPLOAD_CLEANUP_RUN_LIMIT,
    });
    expect(peakDeletions).toBe(UPLOAD_CLEANUP_CONCURRENCY);
    expect(peakDeletions).toBeLessThanOrEqual(25);
  });

  it("never deletes permanent originals for ready media", async () => {
    vi.mocked(deleteUploadObjects).mockResolvedValueOnce(undefined);
    vi.mocked(markQuarantineDeleted).mockResolvedValueOnce(undefined);

    await expect(cleanupReadyPhotoQuarantine()).resolves.toEqual({
      inspected: 1,
      cleaned: 1,
    });
    expect(deleteUploadObjects).toHaveBeenCalledWith([
      readyPhoto.quarantineObjectKey,
    ]);
    expect(deleteUploadObjects).not.toHaveBeenCalledWith(
      expect.arrayContaining([readyPhoto.originalObjectKey]),
    );
  });

  it("removes partial final assets for rejected photos", async () => {
    vi.mocked(listPhotosAwaitingQuarantineCleanup).mockResolvedValueOnce([
      rejectedPhoto,
    ]);
    vi.mocked(deleteUploadObjects).mockResolvedValueOnce(undefined);
    vi.mocked(markQuarantineDeleted).mockResolvedValueOnce(undefined);

    await expect(cleanupReadyPhotoQuarantine()).resolves.toEqual({
      inspected: 1,
      cleaned: 1,
    });
    expect(deleteUploadObjects).toHaveBeenCalledWith([
      rejectedPhoto.quarantineObjectKey,
      rejectedPhoto.originalObjectKey,
      rejectedPhoto.displayObjectKey,
      rejectedPhoto.thumbnailObjectKey,
    ]);
  });
});
