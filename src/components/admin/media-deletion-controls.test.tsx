import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/galleries/actions", () => ({
  deleteGalleryMediaAction: vi.fn(),
  retryGalleryMediaDeletionAction: vi.fn(),
}));

import {
  AdminDeletePendingMediaList,
  AdminMediaDeletionControl,
  getDeleteMediaActionLabel,
  getDeletePendingMediaStatus,
  isDeletionCancelKey,
  MediaDeleteConfirmation,
  restoreFocusToDeletionTrigger,
  type DeletePendingMediaControlItem,
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

  it("renders safe delete-pending progress, recoverable failure, and retry affordances", () => {
    const items: DeletePendingMediaControlItem[] = [
      {
        id: "media-1",
        originalFilename: "dance-floor.png",
        mediaKind: "image",
        deletionRequestedAt: new Date("2026-07-18T12:00:00.000Z"),
        deletionAttempts: 0,
        nextDeletionAttemptAt: null,
        deletionFailedAt: null,
        hasRecoverableFailure: false,
        retryAvailable: true,
      },
      {
        id: "media-2",
        originalFilename: "first-dance.mp4",
        mediaKind: "video",
        deletionRequestedAt: new Date("2026-07-18T12:00:00.000Z"),
        deletionAttempts: 1,
        nextDeletionAttemptAt: new Date("2026-07-18T12:01:00.000Z"),
        deletionFailedAt: new Date("2026-07-18T12:00:30.000Z"),
        hasRecoverableFailure: true,
        retryAvailable: true,
      },
    ];

    const html = renderToStaticMarkup(
      <AdminDeletePendingMediaList galleryId="gallery-1" items={items} />,
    );

    expect(html).toContain("Deletion is in progress");
    expect(html).toContain("Deletion did not finish");
    expect(html).toContain("Retry deletion");
    expect(html).toContain("Retry deleting first-dance.mp4");
    expect(html).not.toMatch(/R2|cloudflarestorage|quarantine|originals\//i);
  });

  it("keeps status messages free of storage implementation details", () => {
    expect(
      getDeletePendingMediaStatus({
        id: "media-1",
        originalFilename: "dance-floor.png",
        mediaKind: "image",
        deletionRequestedAt: new Date("2026-07-18T12:00:00.000Z"),
        deletionAttempts: 1,
        nextDeletionAttemptAt: null,
        deletionFailedAt: new Date("2026-07-18T12:00:30.000Z"),
        hasRecoverableFailure: true,
        retryAvailable: true,
      }),
    ).not.toMatch(/R2|bucket|key|cloudflare/i);
  });
});
