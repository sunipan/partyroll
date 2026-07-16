import { describe, expect, it } from "vitest";

import {
  canTransitionGallery,
  createGalleryInputSchema,
  getAllowedGalleryTransitions,
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
    expect(canTransitionGallery("archived", "open")).toBe(false);
    expect(canTransitionGallery("open", "open")).toBe(false);
  });
});
