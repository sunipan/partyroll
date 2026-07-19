import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/galleries/actions", () => ({
  deleteGalleryMediaAction: vi.fn(),
}));

import {
  AdminMediaDeletionControl,
  getDeleteMediaActionLabel,
  isDeletionCancelKey,
  MediaDeleteConfirmation,
  restoreFocusToDeletionTrigger,
} from "./media-deletion-controls";

describe("admin media deletion controls", () => {
  it("renders a visually destructive button with a filename-specific label", () => {
    const html = renderToStaticMarkup(
      <AdminMediaDeletionControl
        galleryId="gallery-1"
        mediaId="media-1"
        originalFilename="dance-floor.png"
      />,
    );

    expect(html).toContain(getDeleteMediaActionLabel("dance-floor.png"));
    expect(html).toContain("Delete media");
    expect(html).toContain("text-destructive");
    expect(html).not.toContain("Download original");
  });

  it("renders inline confirmation copy with filename, permanence warning, delete, and cancel", () => {
    const html = renderToStaticMarkup(
      <MediaDeleteConfirmation
        galleryId="gallery-1"
        mediaId="media-1"
        originalFilename="first-dance.mp4"
        cursor="page-cursor"
        titleId="delete-title"
        descriptionId="delete-description"
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-labelledby="delete-title"');
    expect(html).toContain('aria-describedby="delete-description"');
    expect(html).toContain("Delete first-dance.mp4?");
    expect(html).toContain("permanently deletes this media item");
    expect(html).toContain("This cannot be undone");
    expect(html).toContain('name="cursor"');
    expect(html).toContain('value="page-cursor"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Cancel");
  });

  it("recognizes Escape cancellation and restores focus to the delete trigger", () => {
    const focus = vi.fn();

    expect(isDeletionCancelKey("Escape")).toBe(true);
    expect(isDeletionCancelKey("Enter")).toBe(false);
    expect(restoreFocusToDeletionTrigger({ isConnected: true, focus })).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
    expect(restoreFocusToDeletionTrigger({ isConnected: false, focus })).toBe(
      false,
    );
    expect(focus).toHaveBeenCalledOnce();
    expect(restoreFocusToDeletionTrigger(null)).toBe(false);
  });

  it("renders a concise retry message without storage details after provider failure", () => {
    const html = renderToStaticMarkup(
      <AdminMediaDeletionControl
        galleryId="gallery-1"
        mediaId="media-1"
        originalFilename="dance-floor.png"
        deletionFailed
      />,
    );

    expect(html).toContain("Media could not be deleted. Please try again.");
    expect(html).toContain("Retry delete");
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/R2|cloudflarestorage|quarantine|originals\//i);
  });
});
