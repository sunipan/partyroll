import { describe, expect, it } from "vitest";

import { deriveGalleryAccessCode } from "@/lib/galleries/invitation-core";

import { parseGalleryAccessCode, verifyGalleryAccessCode } from "./access-code";

const gallery = {
  id: "4adace8a-a157-4c85-af78-d42f14ef3598",
  slug: "john-cathy",
  accessVersion: 1,
};
const secret = "a-development-secret-that-is-long-enough";
const accessCode = deriveGalleryAccessCode({
  galleryId: gallery.id,
  slug: gallery.slug,
  accessVersion: gallery.accessVersion,
  secret,
});

describe("guest gallery access codes", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(parseGalleryAccessCode(`  ${accessCode.toLowerCase()}  `)).toEqual({
      code: accessCode,
      slug: gallery.slug,
    });
  });

  it("rejects malformed, unsupported, and oversized values", () => {
    expect(parseGalleryAccessCode("john-cathy-short")).toBeNull();
    expect(parseGalleryAccessCode("john&cathy-23456789")).toBeNull();
    expect(parseGalleryAccessCode("x".repeat(81))).toBeNull();
  });

  it("accepts only the current derived gallery code", () => {
    expect(verifyGalleryAccessCode({ candidate: accessCode, gallery, secret })).toBe(
      true,
    );
    expect(
      verifyGalleryAccessCode({
        candidate: accessCode,
        gallery: { ...gallery, accessVersion: 2 },
        secret,
      }),
    ).toBe(false);
    expect(
      verifyGalleryAccessCode({
        candidate: accessCode.replace(/.$/, "2"),
        gallery,
        secret,
      }),
    ).toBe(false);
  });
});
