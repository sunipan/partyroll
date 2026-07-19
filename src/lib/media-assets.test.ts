import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getAdminMediaAssetPath,
  getGuestMediaAssetPath,
  isMediaAssetVariant,
  lookupAdminMediaAsset,
  lookupGuestMediaAsset,
  resolveMediaAssetVariant,
  type MediaAssetRecord,
} from "./media-assets";

const galleryId = randomUUID();
const mediaId = randomUUID();
const readyAt = new Date("2026-07-18T12:00:00.000Z");
const createdAt = new Date("2026-07-18T11:59:00.000Z");

describe("authorized media asset resolution", () => {
  it("selects only image thumbnail/display/original/download assets", () => {
    const media = imageMedia({
      originalFilename: '../dance;"floor.jpg',
      declaredMimeType: "image/png",
      mimeType: "image/png",
    });

    expect(resolveMediaAssetVariant(media, "thumbnail")).toMatchObject({
      objectKey: "thumb-key",
      responseContentType: "image/jpeg",
      safeOriginalFilename: "_dance__floor.jpg",
      originalMimeType: "image/png",
      originalByteSize: 1234,
    });
    expect(resolveMediaAssetVariant(media, "display")).toMatchObject({
      objectKey: "display-key",
      responseContentType: "image/jpeg",
    });
    expect(resolveMediaAssetVariant(media, "original")).toMatchObject({
      objectKey: "original-key",
      responseContentType: "image/png",
    });
    expect(resolveMediaAssetVariant(media, "download")).toMatchObject({
      objectKey: "original-key",
      responseContentType: "image/png",
    });
    expect(resolveMediaAssetVariant(media, "video")).toBeNull();
  });

  it("selects only video/original/download assets for video media", () => {
    const media = videoMedia();

    for (const variant of ["video", "original", "download"] as const) {
      expect(resolveMediaAssetVariant(media, variant)).toMatchObject({
        objectKey: "video-original-key",
        responseContentType: "video/mp4",
        width: null,
        height: null,
      });
    }
    expect(resolveMediaAssetVariant(media, "thumbnail")).toBeNull();
    expect(resolveMediaAssetVariant(media, "display")).toBeNull();
  });

  it("fails closed when strict current metadata is incomplete", () => {
    const invalidCases: Array<[string, MediaAssetRecord]> = [
      ["missing ready timestamp", imageMedia({ readyAt: null })],
      ["blank original key", imageMedia({ originalObjectKey: " " })],
      ["unsafe blank filename", imageMedia({ originalFilename: "\u202e" })],
      ["missing original size", imageMedia({ declaredByteSize: 0 })],
      ["missing retained size", imageMedia({ byteSize: null })],
      ["image missing derivative", imageMedia({ thumbnailObjectKey: null })],
      ["image MIME mismatch", imageMedia({ mimeType: "video/mp4" })],
      ["video stale derivative", videoMedia({ thumbnailObjectKey: "stale" })],
    ];

    for (const [label, media] of invalidCases) {
      expect(resolveMediaAssetVariant(media, "original"), label).toBeNull();
    }
  });

  it("returns null before DB lookup for unauthenticated guest/admin callers", async () => {
    const getMediaAssetForGuest = vi.fn();
    const getMediaAssetForOwner = vi.fn();

    await expect(
      lookupGuestMediaAsset(
        { slug: "party", mediaId, variant: "display" },
        {
          getAuthorizedGuestContext: vi.fn(async () => null),
          getMediaAssetForGuest,
        },
      ),
    ).resolves.toBeNull();
    await expect(
      lookupAdminMediaAsset(
        { galleryId, mediaId, variant: "display" },
        { getAdminUserId: vi.fn(async () => null), getMediaAssetForOwner },
      ),
    ).resolves.toBeNull();
    expect(getMediaAssetForGuest).not.toHaveBeenCalled();
    expect(getMediaAssetForOwner).not.toHaveBeenCalled();
  });

  it("passes signed guest and Clerk owner scopes into resource lookups", async () => {
    const getMediaAssetForGuest = vi.fn(async () => imageMedia());
    const getMediaAssetForOwner = vi.fn(async () => videoMedia());

    await expect(
      lookupGuestMediaAsset(
        { slug: "party", mediaId, variant: "display" },
        {
          getAuthorizedGuestContext: vi.fn(async () => ({
            gallery: { id: galleryId, accessVersion: 4 } as never,
            session: { galleryId, accessVersion: 4 },
          })),
          getMediaAssetForGuest,
        },
      ),
    ).resolves.toMatchObject({ objectKey: "display-key" });
    await expect(
      lookupAdminMediaAsset(
        { galleryId, mediaId, variant: "video" },
        { getAdminUserId: vi.fn(async () => "owner-1"), getMediaAssetForOwner },
      ),
    ).resolves.toMatchObject({ objectKey: "video-original-key" });

    expect(getMediaAssetForGuest).toHaveBeenCalledWith({
      galleryId,
      slug: "party",
      accessVersion: 4,
      mediaId,
    });
    expect(getMediaAssetForOwner).toHaveBeenCalledWith({
      ownerClerkId: "owner-1",
      galleryId,
      mediaId,
    });
  });

  it("builds same-origin route paths without signing R2 URLs", () => {
    expect(getGuestMediaAssetPath({ slug: "party-time", mediaId, variant: "display" })).toBe(
      `/g/party-time/media/${mediaId}/display`,
    );
    expect(getAdminMediaAssetPath({ galleryId, mediaId, variant: "thumbnail" })).toBe(
      `/admin/galleries/${galleryId}/media/${mediaId}/thumbnail`,
    );
    expect(isMediaAssetVariant("download")).toBe(true);
    expect(isMediaAssetVariant("poster")).toBe(false);
  });
});

function imageMedia(overrides: Partial<MediaAssetRecord> = {}): MediaAssetRecord {
  return {
    id: mediaId,
    galleryId,
    originalFilename: "dance-floor.jpg",
    declaredMimeType: "image/jpeg",
    declaredByteSize: 1234,
    mediaKind: "image",
    mimeType: "image/jpeg",
    byteSize: 2345,
    width: 800,
    height: 600,
    originalObjectKey: "original-key",
    displayObjectKey: "display-key",
    thumbnailObjectKey: "thumb-key",
    createdAt,
    readyAt,
    ...overrides,
  };
}

function videoMedia(overrides: Partial<MediaAssetRecord> = {}): MediaAssetRecord {
  return {
    ...imageMedia({
      originalFilename: "first-dance.mp4",
      declaredMimeType: "video/mp4",
      mediaKind: "video",
      mimeType: "video/mp4",
      originalObjectKey: "video-original-key",
      displayObjectKey: null,
      thumbnailObjectKey: null,
      width: null,
      height: null,
    }),
    ...overrides,
  };
}
