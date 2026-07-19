import { randomUUID } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => null,
}));
vi.mock("@/app/admin/galleries/actions", () => ({
  deleteGalleryMediaAction: vi.fn(),
  regenerateGalleryAccessAction: vi.fn(),
  retryGalleryMediaDeletionAction: vi.fn(),
  updateGalleryStatusAction: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/galleries/invitations", () => ({
  getGalleryInvitation: vi.fn(),
}));
vi.mock("@/lib/galleries/queries", () => ({
  getGalleryForOwner: vi.fn(),
}));
vi.mock("@/lib/uploads/media", () => ({
  listDeletePendingMediaForOwnerGallery: vi.fn(),
  listReadyMediaForOwnerGallery: vi.fn(),
}));

import { requireAdmin } from "@/lib/auth";
import { getGalleryInvitation } from "@/lib/galleries/invitations";
import { getGalleryForOwner } from "@/lib/galleries/queries";
import {
  listDeletePendingMediaForOwnerGallery,
  listReadyMediaForOwnerGallery,
} from "@/lib/uploads/media";

import GalleryAdminPage from "./page";

const r2CredentialUrlPattern =
  /(?:X-Amz-|AWSAccessKeyId|Signature=|Credential=|r2\.cloudflarestorage\.com)/i;

describe("GalleryAdminPage media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDeletePendingMediaForOwnerGallery).mockResolvedValue([]);
  });

  it("renders admin media previews and downloads with stable owner paths", async () => {
    const galleryId = randomUUID();
    const imageId = randomUUID();
    const videoId = randomUUID();

    vi.mocked(requireAdmin).mockResolvedValue({ userId: "owner-1" });
    vi.mocked(getGalleryForOwner).mockResolvedValue({
      id: galleryId,
      name: "Launch Party",
      slug: "launch-party",
      status: "open",
      eventDate: "2026-07-18",
      accessVersion: 4,
      storageBytes: 4096,
    } as never);
    vi.mocked(getGalleryInvitation).mockReturnValue({
      accessCode: "ABC123",
      invitationLink: "https://partyroll.test/invite/launch-party",
    });
    vi.mocked(listReadyMediaForOwnerGallery).mockResolvedValue({
      items: [
        {
          id: imageId,
          galleryId,
          originalFilename: "dance-floor.png",
          declaredMimeType: "image/png",
          declaredByteSize: 2_048,
          mediaKind: "image",
          mimeType: "image/jpeg",
          byteSize: 1_024,
          originalByteSize: 2_048,
          width: 800,
          height: 600,
          createdAt: new Date("2026-07-18T12:00:00.000Z"),
          readyAt: new Date("2026-07-18T12:01:00.000Z"),
          originalUrl: `/admin/galleries/${galleryId}/media/${imageId}/original`,
          displayUrl: `/admin/galleries/${galleryId}/media/${imageId}/display`,
          thumbnailUrl: `/admin/galleries/${galleryId}/media/${imageId}/thumbnail`,
          downloadUrl: `/admin/galleries/${galleryId}/media/${imageId}/download`,
        },
        {
          id: videoId,
          galleryId,
          originalFilename: "first-dance.mp4",
          declaredMimeType: "video/mp4",
          declaredByteSize: 3_072,
          mediaKind: "video",
          mimeType: "video/mp4",
          byteSize: 3_072,
          originalByteSize: 3_072,
          width: null,
          height: null,
          createdAt: new Date("2026-07-18T12:02:00.000Z"),
          readyAt: new Date("2026-07-18T12:03:00.000Z"),
          originalUrl: `/admin/galleries/${galleryId}/media/${videoId}/video`,
          displayUrl: `/admin/galleries/${galleryId}/media/${videoId}/video`,
          thumbnailUrl: null,
          downloadUrl: `/admin/galleries/${galleryId}/media/${videoId}/download`,
        },
      ],
      nextCursor: "next-cursor",
    });

    const html = renderToStaticMarkup(
      await GalleryAdminPage({ params: Promise.resolve({ id: galleryId }) }),
    );

    expect(html).toContain(
      `/admin/galleries/${galleryId}/media/${imageId}/thumbnail`,
    );
    expect(html).toContain("View image dance-floor.png");
    expect(html).toContain("View video first-dance.mp4");
    expect(html).toContain(
      `/admin/galleries/${galleryId}/media/${imageId}/download`,
    );
    expect(html).toContain(
      `/admin/galleries/${galleryId}/media/${videoId}/download`,
    );
    expect(html).toContain("2 kB");
    expect(html).toContain("Image · 800×600 · 2 kB");
    expect(html).toContain("Download original dance-floor.png");
    expect(html).toContain("Delete media dance-floor.png");
    expect(html).toContain("Delete media first-dance.mp4");
    expect(html).toContain("using 4 kB");
    expect(html).toContain("Next media page");
    expect(html).toContain("next-cursor");
    expect(html).not.toContain("autoplay");
    expect(html).not.toMatch(r2CredentialUrlPattern);
    expect(listReadyMediaForOwnerGallery).toHaveBeenCalledWith({
      ownerClerkId: "owner-1",
      galleryId,
    });
    expect(listDeletePendingMediaForOwnerGallery).toHaveBeenCalledWith({
      ownerClerkId: "owner-1",
      galleryId,
    });
  });

  it("renders delete-pending media with safe retry status instead of dropping it", async () => {
    const galleryId = randomUUID();
    const pendingId = randomUUID();

    vi.mocked(requireAdmin).mockResolvedValue({ userId: "owner-1" });
    vi.mocked(getGalleryForOwner).mockResolvedValue({
      id: galleryId,
      name: "Launch Party",
      slug: "launch-party",
      status: "open",
      eventDate: "2026-07-18",
      accessVersion: 4,
      storageBytes: 0,
    } as never);
    vi.mocked(getGalleryInvitation).mockReturnValue({
      accessCode: "ABC123",
      invitationLink: "https://partyroll.test/invite/launch-party",
    });
    vi.mocked(listReadyMediaForOwnerGallery).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.mocked(listDeletePendingMediaForOwnerGallery).mockResolvedValue([
      {
        id: pendingId,
        galleryId,
        originalFilename: "failed-delete.png",
        mediaKind: "image",
        declaredByteSize: 2_048,
        byteSize: 1_024,
        createdAt: new Date("2026-07-18T12:00:00.000Z"),
        readyAt: new Date("2026-07-18T12:01:00.000Z"),
        deletionRequestedAt: new Date("2026-07-18T12:02:00.000Z"),
        deletionAttempts: 1,
        nextDeletionAttemptAt: null,
        deletionFailedAt: new Date("2026-07-18T12:03:00.000Z"),
        hasRecoverableFailure: true,
        retryAvailable: true,
      },
    ]);

    const html = renderToStaticMarkup(
      await GalleryAdminPage({ params: Promise.resolve({ id: galleryId }) }),
    );

    expect(html).toContain("Deleting failed-delete.png");
    expect(html).toContain("Deletion did not finish");
    expect(html).toContain("Retry deleting failed-delete.png");
    expect(html).not.toMatch(r2CredentialUrlPattern);
  });
});
