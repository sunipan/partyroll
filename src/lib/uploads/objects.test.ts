import { describe, expect, it, vi } from "vitest";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2Mock = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({
  r2: r2Mock,
  r2Bucket: "test-bucket",
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "signed-url"),
}));

import {
  assertOriginalObject,
  createQuarantineUploadUrl,
  deleteUploadObjects,
  getMediaDeletionObjectKeys,
  getReadyMediaObjectKeys,
  InvalidUploadError,
} from "./objects";
import {
  MAX_IMAGE_SOURCE_BYTES,
  MAX_VIDEO_SOURCE_BYTES,
} from "./rules";

describe("upload object helpers", () => {
  it("signs the exact content length and rejects media-specific oversize URLs", async () => {
    await expect(
      createQuarantineUploadUrl({
        objectKey: "quarantine/gallery-1/video-1",
        mimeType: "video/mp4",
        byteSize: MAX_VIDEO_SOURCE_BYTES,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).resolves.toBe("signed-url");
    expect(vi.mocked(getSignedUrl).mock.calls[0]?.[1].input).toMatchObject({
      ContentLength: MAX_VIDEO_SOURCE_BYTES,
      ContentType: "video/mp4",
    });

    await expect(
      createQuarantineUploadUrl({
        objectKey: "quarantine/gallery-1/image-1",
        mimeType: "image/jpeg",
        byteSize: MAX_IMAGE_SOURCE_BYTES + 1,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow("The upload size exceeds the media limit.");
  });

  it("checks completed object size against the MIME-specific limit", async () => {
    const sharedByteSize = MAX_IMAGE_SOURCE_BYTES + 1;
    r2Mock.send
      .mockResolvedValueOnce({
        ContentLength: sharedByteSize,
        ContentType: "image/jpeg",
      })
      .mockResolvedValueOnce({
        ContentLength: sharedByteSize,
        ContentType: "video/mp4",
      });

    await expect(
      assertOriginalObject({
        objectKey: "originals/gallery-1/image-1",
        expectedByteSize: sharedByteSize,
        expectedMimeType: "image/jpeg",
      }),
    ).rejects.toThrow("The original object has an invalid size.");
    await expect(
      assertOriginalObject({
        objectKey: "originals/gallery-1/video-1",
        expectedByteSize: sharedByteSize,
        expectedMimeType: "video/mp4",
      }),
    ).resolves.toBeUndefined();
  });

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

  it("returns stored and convention-owned image keys for deletion", () => {
    expect(
      getMediaDeletionObjectKeys({
        galleryId: "gallery-1",
        id: "photo-1",
        quarantineObjectKey: "legacy/photo-1/quarantine",
        mediaKind: "image",
        originalObjectKey: "legacy/photo-1/original",
        displayObjectKey: "legacy/photo-1/display.jpg",
        thumbnailObjectKey: "legacy/photo-1/thumbnail.jpg",
      }),
    ).toEqual([
      "legacy/photo-1/quarantine",
      "legacy/photo-1/original",
      "quarantine/gallery-1/photo-1",
      "originals/gallery-1/photo-1",
      "legacy/photo-1/display.jpg",
      "legacy/photo-1/thumbnail.jpg",
      "photos/gallery-1/photo-1/display.jpg",
      "photos/gallery-1/photo-1/thumbnail.jpg",
    ]);
  });

  it("returns only quarantine and original keys for video deletion", () => {
    expect(
      getMediaDeletionObjectKeys({
        galleryId: "gallery-1",
        id: "photo-1",
        quarantineObjectKey: "quarantine/gallery-1/photo-1",
        mediaKind: "video",
        originalObjectKey: "originals/gallery-1/photo-1",
        displayObjectKey: null,
        thumbnailObjectKey: null,
      }),
    ).toEqual(["quarantine/gallery-1/photo-1", "originals/gallery-1/photo-1"]);
  });

  it("treats missing object deletes as success and R2 object errors as failure", async () => {
    r2Mock.send.mockResolvedValueOnce({});

    await expect(deleteUploadObjects(["missing-key"])).resolves.toBeUndefined();

    r2Mock.send.mockResolvedValueOnce({ Errors: [{ Key: "bad-key" }] });
    await expect(deleteUploadObjects(["bad-key"])).rejects.toThrow(
      "One or more R2 objects could not be deleted.",
    );
  });
});
