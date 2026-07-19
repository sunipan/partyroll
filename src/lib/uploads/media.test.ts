import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadyMedia } from "./queries";

vi.mock("server-only", () => ({}));
vi.mock("./objects", () => ({
  deleteUploadObjects: vi.fn(),
  getReadyMediaObjectKeys: vi.fn(
    ({
      quarantineObjectKey,
      mediaKind,
      originalObjectKey,
      displayObjectKey,
      thumbnailObjectKey,
    }: {
      quarantineObjectKey: string;
      mediaKind: "image" | "video";
      originalObjectKey: string;
      displayObjectKey: string | null;
      thumbnailObjectKey: string | null;
    }) => [
      quarantineObjectKey,
      originalObjectKey,
      ...(mediaKind === "image" ? [displayObjectKey, thumbnailObjectKey] : []),
    ],
  ),
}));
vi.mock("./queries", () => ({
  deleteReadyMediaRecordForOwner: vi.fn(),
  getReadyMediaForOwner: vi.fn(),
  listReadyMediaForGuest: vi.fn(),
  listReadyMediaForOwner: vi.fn(),
}));

import {
  deleteReadyMediaForOwner,
  listReadyMediaForGuestGallery,
} from "./media";
import { deleteUploadObjects } from "./objects";
import {
  deleteReadyMediaRecordForOwner,
  getReadyMediaForOwner,
  listReadyMediaForGuest,
} from "./queries";

const media = {
  id: randomUUID(),
  galleryId: randomUUID(),
  quarantineObjectKey: `quarantine/${randomUUID()}`,
  originalFilename: "dance-floor.jpg",
  declaredMimeType: "image/jpeg",
  declaredByteSize: 1024,
  mediaKind: "image",
  mimeType: "image/jpeg",
  byteSize: 2048,
  width: 800,
  height: 600,
  originalObjectKey: `originals/${randomUUID()}`,
  displayObjectKey: `photos/${randomUUID()}/display.jpg`,
  thumbnailObjectKey: `photos/${randomUUID()}/thumbnail.jpg`,
  createdAt: new Date("2026-07-17T12:00:00.000Z"),
  readyAt: new Date("2026-07-17T12:01:00.000Z"),
} satisfies ReadyMedia;

describe("ready media delivery and deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listReadyMediaForGuest).mockResolvedValue([media]);
    vi.mocked(getReadyMediaForOwner).mockResolvedValue(media);
    vi.mocked(deleteUploadObjects).mockResolvedValue(undefined);
    vi.mocked(deleteReadyMediaRecordForOwner).mockResolvedValue({
      ...media,
      status: "ready",
      idempotencyKey: randomUUID(),
      uploaderSessionHash: "a".repeat(64),
      quarantineObjectKey: media.quarantineObjectKey,
      quarantineDeletedAt: null,
      declaredMimeType: "image/jpeg",
      declaredByteSize: 1024,
      reservationExpiresAt: new Date("2026-07-17T12:15:00.000Z"),
      processingStartedAt: null,
      completionAttempts: 1,
      nextProcessingAttemptAt: null,
      rejectedAt: null,
    });
  });

  it("creates same-origin delivery paths only after guest scope is checked", async () => {
    const [view] = await listReadyMediaForGuestGallery({
      galleryId: media.galleryId,
      slug: "test-gallery",
      accessVersion: 3,
    });

    expect(view).toMatchObject(
      {
        id: media.id,
        declaredByteSize: 1024,
        originalByteSize: 1024,
        byteSize: 2048,
        originalUrl: `/g/test-gallery/media/${media.id}/original`,
        displayUrl: `/g/test-gallery/media/${media.id}/display`,
        thumbnailUrl: `/g/test-gallery/media/${media.id}/thumbnail`,
      },
    );
    expect(view).not.toHaveProperty("quarantineObjectKey");
    expect(view).not.toHaveProperty("originalObjectKey");
    expect(view).not.toHaveProperty("displayObjectKey");
    expect(view).not.toHaveProperty("thumbnailObjectKey");

    expect(listReadyMediaForGuest).toHaveBeenCalledWith({
      galleryId: media.galleryId,
      slug: "test-gallery",
      accessVersion: 3,
    });
  });

  it("fails closed when ready image metadata is incomplete", async () => {
    vi.mocked(listReadyMediaForGuest).mockResolvedValueOnce([
      {
        ...media,
        thumbnailObjectKey: null,
      },
    ]);

    await expect(
      listReadyMediaForGuestGallery({
        galleryId: media.galleryId,
        slug: "test-gallery",
        accessVersion: 3,
      }),
    ).rejects.toThrow("Ready media is missing required current metadata.");
  });

  it("fails closed when original declared size metadata is missing", async () => {
    vi.mocked(listReadyMediaForGuest).mockResolvedValueOnce([
      {
        ...media,
        declaredByteSize: null,
      } as unknown as ReadyMedia,
    ]);

    await expect(
      listReadyMediaForGuestGallery({
        galleryId: media.galleryId,
        slug: "test-gallery",
        accessVersion: 3,
      }),
    ).rejects.toThrow("Ready media is missing required current metadata.");
  });

  it("fails closed when media kind and MIME metadata disagree", async () => {
    vi.mocked(listReadyMediaForGuest).mockResolvedValueOnce([
      {
        ...media,
        mediaKind: "video",
        declaredMimeType: "image/jpeg",
        mimeType: "image/jpeg",
        displayObjectKey: null,
        thumbnailObjectKey: null,
        width: null,
        height: null,
      },
    ]);

    await expect(
      listReadyMediaForGuestGallery({
        galleryId: media.galleryId,
        slug: "test-gallery",
        accessVersion: 3,
      }),
    ).rejects.toThrow("Ready media is missing required current metadata.");
  });

  it("deletes R2 objects before removing the DB record and accounting", async () => {
    await expect(
      deleteReadyMediaForOwner({
        ownerClerkId: "owner-1",
        galleryId: media.galleryId,
        photoId: media.id,
      }),
    ).resolves.toMatchObject({ outcome: "deleted", media: { id: media.id } });

    expect(getReadyMediaForOwner).toHaveBeenCalledWith({
      ownerClerkId: "owner-1",
      galleryId: media.galleryId,
      photoId: media.id,
    });
    expect(deleteUploadObjects).toHaveBeenCalledWith([
      media.quarantineObjectKey,
      media.originalObjectKey,
      media.displayObjectKey,
      media.thumbnailObjectKey,
    ]);
    expect(deleteReadyMediaRecordForOwner).toHaveBeenCalledWith({
      ownerClerkId: "owner-1",
      galleryId: media.galleryId,
      photoId: media.id,
    });
    expect(
      vi.mocked(deleteUploadObjects).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(deleteReadyMediaRecordForOwner).mock.invocationCallOrder[0],
    );
  });

  it("does not update DB accounting when R2 deletion fails", async () => {
    vi.mocked(deleteUploadObjects).mockRejectedValueOnce(
      new Error("R2 deletion failed"),
    );

    await expect(
      deleteReadyMediaForOwner({
        ownerClerkId: "owner-1",
        galleryId: media.galleryId,
        photoId: media.id,
      }),
    ).rejects.toThrow("R2 deletion failed");
    expect(deleteReadyMediaRecordForOwner).not.toHaveBeenCalled();
  });

  it("does not delete R2 objects when owner/gallery lookup fails", async () => {
    vi.mocked(getReadyMediaForOwner).mockResolvedValueOnce(null);

    await expect(
      deleteReadyMediaForOwner({
        ownerClerkId: "owner-1",
        galleryId: randomUUID(),
        photoId: media.id,
      }),
    ).resolves.toEqual({ outcome: "not-found" });
    expect(deleteUploadObjects).not.toHaveBeenCalled();
    expect(deleteReadyMediaRecordForOwner).not.toHaveBeenCalled();
  });
});
