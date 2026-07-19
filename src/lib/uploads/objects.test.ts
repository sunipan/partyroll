import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({
  r2: {},
  r2Bucket: "test-bucket",
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "signed-url"),
}));

import { getReadyMediaObjectKeys, InvalidUploadError } from "./objects";

describe("upload object helpers", () => {
  it("returns current image object keys without deriving missing metadata", () => {
    expect(
      getReadyMediaObjectKeys({
        galleryId: "gallery-1",
        id: "photo-1",
        quarantineObjectKey: "quarantine/gallery-1/photo-1",
        mediaKind: "image",
        originalObjectKey: "originals/gallery-1/photo-1",
        displayObjectKey: "photos/gallery-1/photo-1/display.jpg",
        thumbnailObjectKey: "photos/gallery-1/photo-1/thumbnail.jpg",
      }),
    ).toEqual([
      "quarantine/gallery-1/photo-1",
      "originals/gallery-1/photo-1",
      "photos/gallery-1/photo-1/display.jpg",
      "photos/gallery-1/photo-1/thumbnail.jpg",
    ]);
  });

  it("returns current video object keys and rejects stale derivatives", () => {
    expect(
      getReadyMediaObjectKeys({
        galleryId: "gallery-1",
        id: "photo-1",
        quarantineObjectKey: "quarantine/gallery-1/photo-1",
        mediaKind: "video",
        originalObjectKey: "originals/gallery-1/photo-1",
        displayObjectKey: null,
        thumbnailObjectKey: null,
      }),
    ).toEqual([
      "quarantine/gallery-1/photo-1",
      "originals/gallery-1/photo-1",
    ]);

    expect(() =>
      getReadyMediaObjectKeys({
        galleryId: "gallery-1",
        id: "photo-1",
        quarantineObjectKey: "quarantine/gallery-1/photo-1",
        mediaKind: "video",
        originalObjectKey: "originals/gallery-1/photo-1",
        displayObjectKey: "stale/display.jpg",
        thumbnailObjectKey: null,
      }),
    ).toThrow(InvalidUploadError);
  });

  it("fails closed when current object metadata is incomplete", () => {
    expect(() =>
      getReadyMediaObjectKeys({
        galleryId: "gallery-1",
        id: "photo-1",
        quarantineObjectKey: "quarantine/gallery-1/photo-1",
        mediaKind: "image",
        originalObjectKey: null,
        displayObjectKey: "photos/gallery-1/photo-1/display.jpg",
        thumbnailObjectKey: "photos/gallery-1/photo-1/thumbnail.jpg",
      }),
    ).toThrow(InvalidUploadError);
  });
});
