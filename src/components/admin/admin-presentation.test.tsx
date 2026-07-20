import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/galleries/actions", () => ({
  createGalleryAction: vi.fn(),
  deleteGalleryAction: vi.fn(),
}));

import { CreateGalleryForm } from "./create-gallery-form";
import {
  GalleryDeleteConfirmation,
  GalleryDeletionControl,
} from "./gallery-deletion-control";
import { GalleryStatusBadge } from "./gallery-status-badge";

describe("admin presentation", () => {
  it("uses the Renee and Sebi example while preserving accessible form fields", () => {
    const html = renderToStaticMarkup(<CreateGalleryForm />);

    expect(html).toContain('placeholder="Renee &amp; Sebi"');
    expect(html).toMatch(/<label[^>]+for="name"[^>]*>Gallery name<\/label>/);
    expect(html).toContain('id="eventDate"');
    expect(html).toContain('type="date"');
  });

  it.each(["open", "closed", "archived", "deleting"] as const)(
    "renders a compact %s status badge with a non-color label",
    (status) => {
      const html = renderToStaticMarkup(<GalleryStatusBadge status={status} />);

      expect(html).toContain(
        `${status.charAt(0).toUpperCase()}${status.slice(1)}`,
      );
      expect(html).toContain("rounded-full bg-current");
      expect(html).toContain("h-5");
    },
  );

  it("keeps gallery deletion discoverable without a dominant trigger", () => {
    const html = renderToStaticMarkup(
      <GalleryDeletionControl
        galleryId="gallery-1"
        galleryName="Renee & Sebi"
      />,
    );

    expect(html).toContain('aria-label="Delete gallery Renee &amp; Sebi"');
    expect(html).toContain("Delete gallery");
    expect(html).toContain("bg-transparent");
    expect(html).toContain("text-muted-foreground");
  });

  it("preserves named confirmation semantics and permanent-delete warning", () => {
    const html = renderToStaticMarkup(
      <GalleryDeleteConfirmation
        galleryId="gallery-1"
        galleryName="Renee & Sebi"
        titleId="gallery-delete-title"
        descriptionId="gallery-delete-description"
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-labelledby="gallery-delete-title"');
    expect(html).toContain('aria-describedby="gallery-delete-description"');
    expect(html).toContain("Deletion is permanent");
    expect(html).toContain("Type Renee &amp; Sebi to confirm");
    expect(html).toContain("Delete permanently");
    expect(html).toContain("Cancel");
  });
});
