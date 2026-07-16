import { describe, expect, it } from "vitest";

import {
  buildGalleryInvitationLink,
  deriveGalleryAccessCode,
} from "./invitation-core";

const invitationInput = {
  galleryId: "4adace8a-a157-4c85-af78-d42f14ef3598",
  slug: "john-cathy",
  accessVersion: 1,
  secret: "a-development-secret-that-is-long-enough",
};

describe("gallery invitations", () => {
  it("derives a stable, human-readable access code", () => {
    const first = deriveGalleryAccessCode(invitationInput);
    const second = deriveGalleryAccessCode(invitationInput);

    expect(first).toBe(second);
    expect(first).toMatch(/^john-cathy-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    expect(first).not.toContain(invitationInput.secret);
  });

  it("changes the code when access is regenerated", () => {
    expect(
      deriveGalleryAccessCode({ ...invitationInput, accessVersion: 2 }),
    ).not.toBe(deriveGalleryAccessCode(invitationInput));
  });

  it("places the credential in a URL fragment", () => {
    const invitationLink = buildGalleryInvitationLink({
      appUrl: "https://partyroll.example",
      accessCode: "john-cathy-7KQ4M9PX",
    });
    const url = new URL(invitationLink);

    expect(url.pathname).toBe("/join");
    expect(url.search).toBe("");
    expect(url.hash).toBe("#john-cathy-7KQ4M9PX");
  });
});
