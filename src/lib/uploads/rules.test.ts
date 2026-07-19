import { describe, expect, it } from "vitest";

import {
  getMaxSourceBytesForMimeType,
  getMediaKindForMimeType,
  MAX_IMAGE_SOURCE_BYTES,
  MAX_SELECTED_UPLOADS,
  MAX_VIDEO_SOURCE_BYTES,
  photoStatusSchema,
  reserveUploadInputSchema,
  supportedImageMimeTypes,
  supportedVideoMimeTypes,
} from "./rules";

const validInput = {
  slug: "john-cathy",
  idempotencyKey: "54ed2020-cd80-4b93-9bde-9e82b3188c29",
  mimeType: "image/jpeg",
  byteSize: 1024,
  originalFilename: "dance-floor.jpg",
};

describe("upload rules", () => {
  it("keeps the queue and source limits generous but bounded", () => {
    expect(MAX_SELECTED_UPLOADS).toBe(100);
    expect(MAX_IMAGE_SOURCE_BYTES).toBe(30 * 1024 * 1024);
    expect(MAX_VIDEO_SOURCE_BYTES).toBe(150 * 1024 * 1024);
    expect(reserveUploadInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("maps approved MIME types to their media kind and limit", () => {
    for (const mimeType of supportedImageMimeTypes) {
      expect(getMediaKindForMimeType(mimeType)).toBe("image");
      expect(getMaxSourceBytesForMimeType(mimeType)).toBe(
        MAX_IMAGE_SOURCE_BYTES,
      );
    }
    for (const mimeType of supportedVideoMimeTypes) {
      expect(getMediaKindForMimeType(mimeType)).toBe("video");
      expect(getMaxSourceBytesForMimeType(mimeType)).toBe(
        MAX_VIDEO_SOURCE_BYTES,
      );
    }
  });

  it("accepts images at 30 MiB and rejects images over 30 MiB", () => {
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        byteSize: MAX_IMAGE_SOURCE_BYTES,
      }).success,
    ).toBe(true);
    const result = reserveUploadInputSchema.safeParse({
      ...validInput,
      byteSize: MAX_IMAGE_SOURCE_BYTES + 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Images must be 30 MB or smaller.",
      );
    }
  });

  it("accepts videos at 150 MiB and rejects videos over 150 MiB", () => {
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        mimeType: "video/mp4",
        byteSize: MAX_VIDEO_SOURCE_BYTES,
      }).success,
    ).toBe(true);
    const result = reserveUploadInputSchema.safeParse({
      ...validInput,
      mimeType: "video/mp4",
      byteSize: MAX_VIDEO_SOURCE_BYTES + 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Videos must be 150 MB or smaller.",
      );
    }
  });

  it("recognizes upload cleanup states", () => {
    expect(photoStatusSchema.safeParse("deleting").success).toBe(true);
    expect(photoStatusSchema.safeParse("deleted").success).toBe(false);
  });

  it("rejects unsupported files, oversized files, and malformed identifiers", () => {
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        mimeType: "application/pdf",
      }).success,
    ).toBe(false);
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        byteSize: MAX_IMAGE_SOURCE_BYTES + 1,
      }).success,
    ).toBe(false);
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        idempotencyKey: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        originalFilename: "",
      }).success,
    ).toBe(false);
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        originalFilename: "../secret.jpg",
      }).success,
    ).toBe(false);
  });
});
