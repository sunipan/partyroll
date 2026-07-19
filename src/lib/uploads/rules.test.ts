import { describe, expect, it } from "vitest";

import {
  MAX_SELECTED_UPLOADS,
  MAX_SOURCE_BYTES,
  reserveUploadInputSchema,
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
    expect(MAX_SOURCE_BYTES).toBe(15 * 1024 * 1024);
    expect(reserveUploadInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("accepts supported images and videos", () => {
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        mimeType: "video/mp4",
      }).success,
    ).toBe(true);
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        mimeType: "video/quicktime",
      }).success,
    ).toBe(true);
    expect(
      reserveUploadInputSchema.safeParse({
        ...validInput,
        mimeType: "video/webm",
      }).success,
    ).toBe(true);
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
        byteSize: MAX_SOURCE_BYTES + 1,
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
