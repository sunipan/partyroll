import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  lookupAdminMediaAssetForOwner,
  lookupGuestMediaAssetForSession,
} from "./media-assets";

describe("media asset lookup ID guards", () => {
  it("fails closed before DB lookup for malformed UUID params", async () => {
    const getMediaAssetForGuest = vi.fn();
    const getMediaAssetForOwner = vi.fn();
    const galleryId = randomUUID();
    const mediaId = randomUUID();

    await expect(
      lookupGuestMediaAssetForSession(
        {
          galleryId,
          slug: "party",
          accessVersion: 4,
          mediaId: "not-a-uuid",
          variant: "display",
        },
        { getMediaAssetForGuest },
      ),
    ).resolves.toBeNull();
    await expect(
      lookupAdminMediaAssetForOwner(
        {
          ownerClerkId: "owner-1",
          galleryId: "not-a-uuid",
          mediaId,
          variant: "display",
        },
        { getMediaAssetForOwner },
      ),
    ).resolves.toBeNull();

    expect(getMediaAssetForGuest).not.toHaveBeenCalled();
    expect(getMediaAssetForOwner).not.toHaveBeenCalled();
  });
});
