import { describe, expect, it } from "vitest";

import { parseGalleryAccessCode } from "@/lib/guest-access/access-code";
import {
  completeUploadInputSchema,
  reserveUploadInputSchema,
} from "@/lib/uploads/rules";

import {
  buildCollisionGallerySlug,
  canTransitionGallery,
  createGalleryInputSchema,
  getAllowedGalleryTransitions,
  MAX_GALLERY_SLUG_LENGTH,
  slugifyGalleryName,
} from "./rules";

describe("gallery rules", () => {
  it("normalizes a party name into a stable slug", () => {
    expect(slugifyGalleryName("  John & Cathy  ")).toBe("john-cathy");
    expect(slugifyGalleryName("Élodie’s 30th! ")).toBe("elodie-s-30th");
  });

  it("falls back to a usable slug when the name has no ASCII letters", () => {
    expect(slugifyGalleryName("🎉 🎉")).toBe("gallery");
  });

  it("keeps long gallery name slugs within guest access and upload limits", () => {
    const slug = slugifyGalleryName("Long Wedding Gallery ".repeat(8));

    expect(slug).toHaveLength(MAX_GALLERY_SLUG_LENGTH);
    expectSlugToSatisfyGuestContracts(slug);
  });

  it("truncates collision slugs to leave room for retry suffixes", () => {
    const baseSlug = slugifyGalleryName("Collision Gallery ".repeat(8));
    const numericRetrySlug = buildCollisionGallerySlug(baseSlug, "100");
    const randomRetrySlug = buildCollisionGallerySlug(baseSlug, "deadbeef");

    expect(numericRetrySlug).toHaveLength(MAX_GALLERY_SLUG_LENGTH);
    expect(numericRetrySlug).toMatch(/-100$/);
    expectSlugToSatisfyGuestContracts(numericRetrySlug);

    expect(randomRetrySlug).toHaveLength(MAX_GALLERY_SLUG_LENGTH);
    expect(randomRetrySlug).toMatch(/-deadbeef$/);
    expectSlugToSatisfyGuestContracts(randomRetrySlug);
  });

  it("validates and trims gallery creation values", () => {
    expect(
      createGalleryInputSchema.parse({
        name: "  John & Cathy  ",
        eventDate: "2026-08-22",
      }),
    ).toEqual({ name: "John & Cathy", eventDate: "2026-08-22" });
  });

  it("rejects blank names and impossible calendar dates", () => {
    expect(
      createGalleryInputSchema.safeParse({ name: "   ", eventDate: "2026-02-31" })
        .success,
    ).toBe(false);
  });

  it("allows only the approved lifecycle transitions", () => {
    expect(getAllowedGalleryTransitions("open")).toEqual(["closed", "archived"]);
    expect(canTransitionGallery("closed", "open")).toBe(true);
    expect(canTransitionGallery("archived", "closed")).toBe(true);
    expect(getAllowedGalleryTransitions("deleting")).toEqual([]);
    expect(canTransitionGallery("archived", "open")).toBe(false);
    expect(canTransitionGallery("open", "deleting")).toBe(false);
    expect(canTransitionGallery("deleting", "open")).toBe(false);
    expect(canTransitionGallery("open", "open")).toBe(false);
  });
});

function expectSlugToSatisfyGuestContracts(slug: string): void {
  expect(slug.length).toBeLessThanOrEqual(MAX_GALLERY_SLUG_LENGTH);
  expect(parseGalleryAccessCode(`${slug}-23456789`)).toEqual({
    code: `${slug}-23456789`,
    slug,
  });
  expect(
    reserveUploadInputSchema.safeParse({
      slug,
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
      mimeType: "image/jpeg",
      byteSize: 1,
      originalFilename: "guest.jpg",
    }).success,
  ).toBe(true);
  expect(completeUploadInputSchema.safeParse({ slug }).success).toBe(true);
}
