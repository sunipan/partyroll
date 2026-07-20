import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/guest-access/session", () => ({
  getAuthorizedGuestContext: vi.fn(),
}));
vi.mock("@/lib/uploads/media", () => ({
  listReadyMediaForGuestGallery: vi.fn(),
}));

import { getAuthorizedGuestContext } from "@/lib/guest-access/session";
import { listReadyMediaForGuestGallery } from "@/lib/uploads/media";

import GuestGalleryPage from "./page";

const gallery = {
  id: "gallery-1",
  name: "Maya & Theo's Garden Party",
  slug: "garden-party",
  status: "open" as const,
  eventDate: "2026-07-18",
};

const image = {
  id: "image-1",
  originalFilename: "garden-toast.jpg",
  mediaKind: "image" as const,
  originalUrl: "/g/garden-party/media/image-1/original",
  displayUrl: "/g/garden-party/media/image-1/display",
  thumbnailUrl: "/g/garden-party/media/image-1/thumbnail",
  downloadUrl: "/g/garden-party/media/image-1/download",
  originalByteSize: 2_048,
  width: 1200,
  height: 800,
};

describe("GuestGalleryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the private open-gallery identity, upload guidance, media, and pagination", async () => {
    vi.mocked(getAuthorizedGuestContext).mockResolvedValue({
      gallery,
      session: { accessVersion: 2 },
    } as never);
    vi.mocked(listReadyMediaForGuestGallery).mockResolvedValue({
      items: [image],
      nextCursor: "next-page",
    } as never);

    const html = renderToStaticMarkup(
      await GuestGalleryPage({
        params: Promise.resolve({ slug: gallery.slug }),
      }),
    );

    expect(html).toContain("Private gallery");
    expect(html).toContain("Open for contributions");
    expect(html).toContain("Only guests with this private invitation can see the roll.");
    expect(html).toContain('id="guest-upload"');
    expect(html).toContain('id="guest-upload-title"');
    expect(html).toContain("Add to the roll");
    expect(html).toContain('aria-label="Choose photos or videos to upload"');
    expect(html).toMatch(
      /<input[^>]*aria-label="Choose photos or videos to upload"[^>]*class="[^"]*\bhidden\b[^"]*"/,
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Images up to 100 MB · Videos up to 150 MB");
    expect(html).toContain(
      'class="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"',
    );
    expect(html).toContain(image.thumbnailUrl);
    expect(html).toContain(image.downloadUrl);
    expect(html).toContain("Next media page");
    expect(html).toContain("next-page");
    expect(html).not.toContain("autoplay");
    expect(listReadyMediaForGuestGallery).toHaveBeenCalledWith({
      galleryId: gallery.id,
      slug: gallery.slug,
      accessVersion: 2,
    });
  });

  it.each([
    [
      "closed" as const,
      "Viewing only",
      "The host has paused new photo and video uploads.",
      "No photos or videos were shared before the host closed uploads.",
    ],
    [
      "archived" as const,
      "Gallery archived",
      "This keepsake has been archived.",
      "This archived gallery does not have any shared photos or videos.",
    ],
  ])("keeps the %s gallery state clear without offering uploads", async (status, label, statusCopy, emptyCopy) => {
    vi.mocked(getAuthorizedGuestContext).mockResolvedValue({
      gallery: { ...gallery, status },
      session: { accessVersion: 2 },
    } as never);
    vi.mocked(listReadyMediaForGuestGallery).mockResolvedValue({
      items: [],
      nextCursor: null,
    } as never);

    const html = renderToStaticMarkup(
      await GuestGalleryPage({
        params: Promise.resolve({ slug: gallery.slug }),
      }),
    );

    expect(html).toContain(label);
    expect(html).toContain(statusCopy);
    expect(html).toContain(emptyCopy);
    expect(html).toContain('id="empty-gallery-title"');
    expect(html).not.toContain('id="guest-upload"');
  });

  it("offers a return to the first page when a cursor has no media", async () => {
    vi.mocked(getAuthorizedGuestContext).mockResolvedValue({
      gallery,
      session: { accessVersion: 2 },
    } as never);
    vi.mocked(listReadyMediaForGuestGallery).mockResolvedValue({
      items: [],
      nextCursor: null,
    } as never);

    const html = renderToStaticMarkup(
      await GuestGalleryPage({
        params: Promise.resolve({ slug: gallery.slug }),
        searchParams: Promise.resolve({ cursor: "empty-page" }),
      }),
    );

    expect(html).toContain("No moments on this page");
    expect(html).toContain("First media page");
    expect(html).toContain('href="/g/garden-party"');
    expect(listReadyMediaForGuestGallery).toHaveBeenCalledWith({
      galleryId: gallery.id,
      slug: gallery.slug,
      accessVersion: 2,
      cursor: "empty-page",
    });
  });
});
