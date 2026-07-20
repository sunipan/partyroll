import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadyMedia } from "./queries";

vi.mock("server-only", () => ({}));
vi.mock("./objects", () => ({
  deleteUploadObjects: vi.fn(),
  getMediaDeletionObjectKeys: vi.fn(
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
  getReadyPhotoForOwner: vi.fn(),
  listReadyMediaForGuest: vi.fn(),
  listReadyMediaForOwner: vi.fn(),
}));

import {
  deleteReadyMediaForOwner,
  listReadyMediaForGuestGallery,
  listReadyMediaForOwnerGallery,
} from "./media";
import { deleteUploadObjects } from "./objects";
import {
  deleteReadyMediaRecordForOwner,
  getReadyPhotoForOwner,
  listReadyMediaForGuest,
  listReadyMediaForOwner,
} from "./queries";

const thumbnailPlaceholderDataUrl = "data:image/jpeg;base64,/9j/2Q==";

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
  thumbnailPlaceholderDataUrl,
  createdAt: new Date("2026-07-17T12:00:00.000Z"),
  readyAt: new Date("2026-07-17T12:01:00.000Z"),
} satisfies ReadyMedia;

const claimedMedia = {
  ...media,
  thumbnailPlaceholderDataUrl: null,
  status: "ready",
  idempotencyKey: randomUUID(),
  uploaderSessionHash: "a".repeat(64),
  quarantineDeletedAt: null,
  reservationExpiresAt: new Date("2026-07-17T12:15:00.000Z"),
  processingStartedAt: null,
  completionAttempts: 1,
  nextProcessingAttemptAt: null,
  rejectedAt: null,
} satisfies import("@/db/schema").Photo;

describe("ready media delivery and deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listReadyMediaForGuest).mockResolvedValue({
      items: [media],
      nextCursor: null,
    });
    vi.mocked(listReadyMediaForOwner).mockResolvedValue({
      items: [media],
      nextCursor: null,
    });
    vi.mocked(getReadyPhotoForOwner).mockResolvedValue(claimedMedia);
    vi.mocked(deleteUploadObjects).mockResolvedValue(undefined);
    vi.mocked(deleteReadyMediaRecordForOwner).mockResolvedValue(claimedMedia);
  });

  it("creates same-origin delivery paths only after guest scope is checked", async () => {
    const page = await listReadyMediaForGuestGallery({
      galleryId: media.galleryId,
      slug: "test-gallery",
      accessVersion: 3,
    });
    const [view] = page.items;

    expect(view).toMatchObject(
      {
        id: media.id,
        declaredByteSize: 1024,
        originalByteSize: 1024,
        byteSize: 2048,
        originalUrl: `/g/test-gallery/media/${media.id}/original`,
        displayUrl: `/g/test-gallery/media/${media.id}/display`,
        thumbnailUrl: `/g/test-gallery/media/${media.id}/thumbnail`,
        thumbnailPlaceholderDataUrl,
        downloadUrl: `/g/test-gallery/media/${media.id}/download`,
      },
    );
    expect(view).not.toHaveProperty("quarantineObjectKey");
    expect(view).not.toHaveProperty("originalObjectKey");
    expect(view).not.toHaveProperty("displayObjectKey");
    expect(view).not.toHaveProperty("thumbnailObjectKey");
    expect(JSON.stringify(view)).not.toContain(media.quarantineObjectKey);
    expect(JSON.stringify(view)).not.toContain(media.originalObjectKey);
    expect(JSON.stringify(view)).not.toContain(media.displayObjectKey);
    expect(JSON.stringify(view)).not.toContain(media.thumbnailObjectKey);

    expect(listReadyMediaForGuest).toHaveBeenCalledWith({
      galleryId: media.galleryId,
      slug: "test-gallery",
      accessVersion: 3,
    });
  });

  it("creates owner-authorized admin delivery paths without R2 credentials", async () => {
    const page = await listReadyMediaForOwnerGallery({
      ownerClerkId: "owner-1",
      galleryId: media.galleryId,
    });
    const [view] = page.items;

    expect(view).toMatchObject({
      originalByteSize: 1024,
      byteSize: 2048,
      originalUrl: `/admin/galleries/${media.galleryId}/media/${media.id}/original`,
      displayUrl: `/admin/galleries/${media.galleryId}/media/${media.id}/display`,
      thumbnailUrl: `/admin/galleries/${media.galleryId}/media/${media.id}/thumbnail`,
      thumbnailPlaceholderDataUrl,
      downloadUrl: `/admin/galleries/${media.galleryId}/media/${media.id}/download`,
    });
    expect(stableMediaPaths(view)).not.toMatch(r2CredentialUrlPattern);
    expect(view).not.toHaveProperty("quarantineObjectKey");
    expect(view).not.toHaveProperty("originalObjectKey");
    expect(view).not.toHaveProperty("displayObjectKey");
    expect(view).not.toHaveProperty("thumbnailObjectKey");
    expect(listReadyMediaForOwner).toHaveBeenCalledWith({
      ownerClerkId: "owner-1",
      galleryId: media.galleryId,
    });
  });

  it("preserves legacy nulls and pagination while forcing video placeholders to null", async () => {
    const legacyImage = {
      ...media,
      id: randomUUID(),
      thumbnailPlaceholderDataUrl: null,
    } satisfies ReadyMedia;
    const video = {
      ...media,
      id: randomUUID(),
      originalFilename: "first-dance.mp4",
      declaredMimeType: "video/mp4",
      mediaKind: "video",
      mimeType: "video/mp4",
      displayObjectKey: null,
      thumbnailObjectKey: null,
      thumbnailPlaceholderDataUrl,
      width: null,
      height: null,
    } satisfies ReadyMedia;
    vi.mocked(listReadyMediaForGuest).mockResolvedValueOnce({
      items: [legacyImage, video],
      nextCursor: "next-cursor",
    });
    vi.mocked(listReadyMediaForOwner).mockResolvedValueOnce({
      items: [legacyImage, video],
      nextCursor: "next-cursor",
    });

    const guestPage = await listReadyMediaForGuestGallery({
      galleryId: media.galleryId,
      slug: "test-gallery",
      accessVersion: 3,
      cursor: "current-cursor",
    });
    const ownerPage = await listReadyMediaForOwnerGallery({
      ownerClerkId: "owner-1",
      galleryId: media.galleryId,
      cursor: "current-cursor",
    });

    expect(guestPage.nextCursor).toBe("next-cursor");
    expect(ownerPage.nextCursor).toBe("next-cursor");
    expect(guestPage.items.map((item) => item.thumbnailPlaceholderDataUrl)).toEqual([
      null,
      null,
    ]);
    expect(ownerPage.items.map((item) => item.thumbnailPlaceholderDataUrl)).toEqual([
      null,
      null,
    ]);
    expect(guestPage.items[1]).toMatchObject({
      mediaKind: "video",
      thumbnailUrl: null,
      thumbnailPlaceholderDataUrl: null,
    });
    expect(listReadyMediaForGuest).toHaveBeenLastCalledWith({
      galleryId: media.galleryId,
      slug: "test-gallery",
      accessVersion: 3,
      cursor: "current-cursor",
    });
    expect(listReadyMediaForOwner).toHaveBeenLastCalledWith({
      ownerClerkId: "owner-1",
      galleryId: media.galleryId,
      cursor: "current-cursor",
    });
  });

  it("fails closed when ready image metadata is incomplete", async () => {
    vi.mocked(listReadyMediaForGuest).mockResolvedValueOnce({
      items: [
        {
          ...media,
          thumbnailObjectKey: null,
        },
      ],
      nextCursor: null,
    });

    await expect(
      listReadyMediaForGuestGallery({
        galleryId: media.galleryId,
        slug: "test-gallery",
        accessVersion: 3,
      }),
    ).rejects.toThrow("Ready media is missing required current metadata.");
  });

  it("fails closed when original declared size metadata is missing", async () => {
    vi.mocked(listReadyMediaForGuest).mockResolvedValueOnce({
      items: [
        {
          ...media,
          declaredByteSize: null,
        } as unknown as ReadyMedia,
      ],
      nextCursor: null,
    });

    await expect(
      listReadyMediaForGuestGallery({
        galleryId: media.galleryId,
        slug: "test-gallery",
        accessVersion: 3,
      }),
    ).rejects.toThrow("Ready media is missing required current metadata.");
  });

  it("fails closed when media kind and MIME metadata disagree", async () => {
    vi.mocked(listReadyMediaForGuest).mockResolvedValueOnce({
      items: [
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
      ],
      nextCursor: null,
    });

    await expect(
      listReadyMediaForGuestGallery({
        galleryId: media.galleryId,
        slug: "test-gallery",
        accessVersion: 3,
      }),
    ).rejects.toThrow("Ready media is missing required current metadata.");
  });

  it("verifies owner-ready media before R2 deletion and removes the row after R2 success", async () => {
    const now = new Date("2026-07-17T12:02:00.000Z");

    await expect(
      deleteReadyMediaForOwner({
        ownerClerkId: "owner-1",
        galleryId: media.galleryId,
        photoId: media.id,
        now,
      }),
    ).resolves.toMatchObject({ outcome: "deleted", media: { id: media.id } });

    expect(getReadyPhotoForOwner).toHaveBeenCalledWith({
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
      now,
    });
    expect(
      vi.mocked(getReadyPhotoForOwner).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(deleteUploadObjects).mock.invocationCallOrder[0]);
    expect(
      vi.mocked(deleteUploadObjects).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(deleteReadyMediaRecordForOwner).mock.invocationCallOrder[0],
    );
  });

  it("leaves media retryable and unchanged when R2 deletion fails", async () => {
    const now = new Date("2026-07-17T12:03:00.000Z");
    vi.mocked(deleteUploadObjects).mockRejectedValueOnce(
      new Error("R2 deletion failed"),
    );

    await expect(
      deleteReadyMediaForOwner({
        ownerClerkId: "owner-1",
        galleryId: media.galleryId,
        photoId: media.id,
        now,
      }),
    ).resolves.toMatchObject({
      outcome: "retryable-error",
      media: { id: media.id },
      message: "Media could not be deleted. Please try again.",
    });
    expect(deleteReadyMediaRecordForOwner).not.toHaveBeenCalled();
  });

  it("does not delete R2 objects when owner/gallery lookup fails", async () => {
    vi.mocked(getReadyPhotoForOwner).mockResolvedValueOnce(null);

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

  it("lets a later owner retry call delete the same ready row after provider recovery", async () => {
    vi.mocked(deleteUploadObjects)
      .mockRejectedValueOnce(new Error("R2 deletion failed"))
      .mockResolvedValueOnce(undefined);

    await expect(
      deleteReadyMediaForOwner({
        ownerClerkId: "owner-1",
        galleryId: media.galleryId,
        photoId: media.id,
      }),
    ).resolves.toMatchObject({ outcome: "retryable-error" });
    await expect(
      deleteReadyMediaForOwner({
        ownerClerkId: "owner-1",
        galleryId: media.galleryId,
        photoId: media.id,
      }),
    ).resolves.toMatchObject({ outcome: "deleted", media: { id: media.id } });

    expect(deleteUploadObjects).toHaveBeenCalledTimes(2);
    expect(deleteReadyMediaRecordForOwner).toHaveBeenCalledTimes(1);
  });
});

const r2CredentialUrlPattern =
  /(?:X-Amz-|AWSAccessKeyId|Signature=|Credential=|r2\.cloudflarestorage\.com)/i;

function stableMediaPaths(view: {
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string | null;
  downloadUrl: string;
}) {
  return [
    view.originalUrl,
    view.displayUrl,
    view.thumbnailUrl,
    view.downloadUrl,
  ].join("\n");
}
