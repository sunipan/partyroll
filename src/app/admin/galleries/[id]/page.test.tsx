import { randomUUID } from "node:crypto";

import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => null,
}));
vi.mock("@/app/admin/galleries/actions", () => ({
  deleteGalleryMediaAction: vi.fn(),
  regenerateGalleryAccessAction: vi.fn(),
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
  listReadyMediaForOwnerGallery: vi.fn(),
}));

import { requireAdmin } from "@/lib/auth";
import { getGalleryInvitation } from "@/lib/galleries/invitations";
import { getGalleryForOwner } from "@/lib/galleries/queries";
import { listReadyMediaForOwnerGallery } from "@/lib/uploads/media";
import {
  GalleryMediaViewer,
  type GalleryMediaViewerItem,
} from "@/components/gallery/media-viewer";

import GalleryAdminPage from "./page";

const r2CredentialUrlPattern =
  /(?:X-Amz-|AWSAccessKeyId|Signature=|Credential=|r2\.cloudflarestorage\.com)/i;
const thumbnailPlaceholderDataUrl = "data:image/jpeg;base64,/9j/2Q==";

describe("GalleryAdminPage media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders admin media in two mobile columns with stable owner paths", async () => {
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
          thumbnailPlaceholderDataUrl,
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
          thumbnailPlaceholderDataUrl: null,
          downloadUrl: `/admin/galleries/${galleryId}/media/${videoId}/download`,
        },
        {
          id: randomUUID(),
          galleryId,
          originalFilename: "legacy-toast.jpg",
          declaredMimeType: "image/jpeg",
          declaredByteSize: 2_048,
          mediaKind: "image",
          mimeType: "image/jpeg",
          byteSize: 1_024,
          originalByteSize: 2_048,
          width: 800,
          height: 600,
          createdAt: new Date("2026-07-18T11:00:00.000Z"),
          readyAt: new Date("2026-07-18T11:01:00.000Z"),
          originalUrl: `/admin/galleries/${galleryId}/media/legacy-image/original`,
          displayUrl: `/admin/galleries/${galleryId}/media/legacy-image/display`,
          thumbnailUrl: `/admin/galleries/${galleryId}/media/legacy-image/thumbnail`,
          thumbnailPlaceholderDataUrl: null,
          downloadUrl: `/admin/galleries/${galleryId}/media/legacy-image/download`,
        },
      ],
      nextCursor: "next-cursor",
    });

    const page = await GalleryAdminPage({
      params: Promise.resolve({ id: galleryId }),
    });
    const html = renderToStaticMarkup(page);
    const viewerItems = getGalleryMediaViewerItems(page);

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
    expect(html).toContain("Gallery workspace");
    expect(html).toContain("tracking-[0.16em]");
    expect(html).toContain("Download QR code");
    expect(html.indexOf("Guest invitation")).toBeLessThan(
      html.indexOf("Gallery availability"),
    );
    expect(html.indexOf("Regenerate guest access")).toBeLessThan(
      html.indexOf("Uploaded media"),
    );
    expect(html).toContain(
      'class="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3"',
    );
    expect(html).not.toContain("autoplay");
    expect(html).not.toMatch(r2CredentialUrlPattern);
    expect(viewerItems.map((item) => item.thumbnailPlaceholderDataUrl)).toEqual([
      thumbnailPlaceholderDataUrl,
      null,
      null,
    ]);
    expect(viewerItems[1]).toMatchObject({
      mediaKind: "video",
      thumbnailUrl: null,
      thumbnailPlaceholderDataUrl: null,
    });
    expect(viewerItems.every((item) => !("originalObjectKey" in item))).toBe(true);
    expect(listReadyMediaForOwnerGallery).toHaveBeenCalledWith({
      ownerClerkId: "owner-1",
      galleryId,
    });
  });

  it("keeps ready media visible with a concise retry message after deletion failure", async () => {
    const galleryId = randomUUID();
    const mediaId = randomUUID();

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
      items: [
        {
          id: mediaId,
          galleryId,
          originalFilename: "failed-delete.png",
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
          originalUrl: `/admin/galleries/${galleryId}/media/${mediaId}/original`,
          displayUrl: `/admin/galleries/${galleryId}/media/${mediaId}/display`,
          thumbnailUrl: `/admin/galleries/${galleryId}/media/${mediaId}/thumbnail`,
          thumbnailPlaceholderDataUrl: null,
          downloadUrl: `/admin/galleries/${galleryId}/media/${mediaId}/download`,
        },
      ],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      await GalleryAdminPage({
        params: Promise.resolve({ id: galleryId }),
        searchParams: Promise.resolve({ deleteError: mediaId }),
      }),
    );

    expect(html).toContain("View image failed-delete.png");
    expect(html).toContain("Media could not be deleted. Please try again.");
    expect(html).toContain("Retry delete");
    expect(html).not.toMatch(r2CredentialUrlPattern);
  });
});

function getGalleryMediaViewerItems(node: ReactNode): GalleryMediaViewerItem[] {
  if (!isValidElement(node)) {
    return [];
  }
  if (node.type === GalleryMediaViewer) {
    return (node.props as { items: GalleryMediaViewerItem[] }).items;
  }

  return Children.toArray((node.props as { children?: ReactNode }).children).flatMap(
    getGalleryMediaViewerItems,
  );
}
