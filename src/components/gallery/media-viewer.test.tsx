import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  createCancelableMediaViewerCleanup,
  GalleryMediaDialog,
  GalleryMediaViewer,
  formatGalleryMediaDetails,
  getActiveGalleryMediaItem,
  getDownloadViewerActionLabel,
  getOpenViewerActionLabel,
  getViewerMediaSource,
  resetViewerVideo,
  restoreFocusToViewerTrigger,
  showNativeMediaDialog,
  type GalleryMediaViewerItem,
} from "./media-viewer";

const imageItem: GalleryMediaViewerItem = {
  id: "image-1",
  originalFilename: "dance-floor.png",
  mediaKind: "image",
  originalUrl: "/g/party/media/image-1/original",
  displayUrl: "/g/party/media/image-1/display",
  thumbnailUrl: "/g/party/media/image-1/thumbnail",
  downloadUrl: "/g/party/media/image-1/download",
  originalByteSize: 2_048,
  width: 800,
  height: 600,
};

const videoItem: GalleryMediaViewerItem = {
  id: "video-1",
  originalFilename: "first-dance.mp4",
  mediaKind: "video",
  originalUrl: "/g/party/media/video-1/video",
  displayUrl: "/g/party/media/video-1/video",
  thumbnailUrl: null,
  downloadUrl: "/g/party/media/video-1/download",
  originalByteSize: 3_072,
  width: null,
  height: null,
};

describe("GalleryMediaViewer", () => {
  it("renders native buttons and descriptive original download links", () => {
    const html = renderToStaticMarkup(
      <GalleryMediaViewer items={[imageItem, videoItem]} />,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain(getOpenViewerActionLabel(imageItem));
    expect(html).toContain(getOpenViewerActionLabel(videoItem));
    expect(html).toContain(imageItem.thumbnailUrl);
    expect(html).toContain(imageItem.downloadUrl);
    expect(html).toContain(videoItem.downloadUrl);
    expect(html).toContain(getDownloadViewerActionLabel(imageItem));
    expect(html).toContain("Image · 800×600 · 2 kB");
    expect(html).toContain("Video · 3 kB");
    expect(html).not.toContain("Delete media");
    expect(html).not.toContain("autoplay");
  });

  it("keeps optional owner actions separate from view and download controls", () => {
    const html = renderToStaticMarkup(
      <GalleryMediaViewer
        items={[imageItem]}
        itemActions={[
          <button key="delete" type="button" aria-label="Delete media dance-floor.png">
            Delete media
          </button>,
        ]}
      />,
    );

    expect(html).toContain(getOpenViewerActionLabel(imageItem));
    expect(html).toContain(getDownloadViewerActionLabel(imageItem));
    expect(html).toContain('aria-label="Delete media dance-floor.png"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Download original");
  });

  it("renders dialog labels, close control, image preview, video controls, and download action", () => {
    const imageDialog = renderToStaticMarkup(
      <GalleryMediaDialog
        media={imageItem}
        titleId="media-title"
        descriptionId="media-description"
        onRequestClose={() => undefined}
      />,
    );
    const videoDialog = renderToStaticMarkup(
      <GalleryMediaDialog
        media={videoItem}
        titleId="video-title"
        descriptionId="video-description"
        onRequestClose={() => undefined}
      />,
    );

    expect(imageDialog).toContain("<dialog");
    expect(imageDialog).toContain('aria-labelledby="media-title"');
    expect(imageDialog).toContain('aria-describedby="media-description"');
    expect(imageDialog).toContain('aria-modal="true"');
    expect(imageDialog).toContain('aria-label="Close media viewer"');
    expect(imageDialog).toContain(imageItem.displayUrl);
    expect(imageDialog).toContain(getDownloadViewerActionLabel(imageItem));
    expect(videoDialog).toContain("<video");
    expect(videoDialog).toContain("controls");
    expect(videoDialog).toContain(videoItem.originalUrl);
    expect(videoDialog).not.toContain("autoplay");
  });

  it("selects authorized display/video sources and labels", () => {
    expect(getViewerMediaSource(imageItem)).toBe(imageItem.displayUrl);
    expect(getViewerMediaSource(videoItem)).toBe(videoItem.originalUrl);
    expect(formatGalleryMediaDetails(imageItem)).toBe("Image · 800×600 · 2 kB");
    expect(formatGalleryMediaDetails(videoItem)).toBe("Video · 3 kB");
  });

  it("derives active media by id from the current item list", () => {
    const updatedImage = { ...imageItem, originalFilename: "updated.png" };

    expect(getActiveGalleryMediaItem([imageItem], imageItem.id)).toBe(imageItem);
    expect(getActiveGalleryMediaItem([updatedImage], imageItem.id)).toBe(
      updatedImage,
    );
    expect(getActiveGalleryMediaItem([videoItem], imageItem.id)).toBeNull();
    expect(getActiveGalleryMediaItem([imageItem], null)).toBeNull();
  });

  it("requires showModal for native modal presentation", () => {
    const unsupportedDialog = { open: false };
    const failingDialog = {
      open: false,
      showModal: vi.fn(() => {
        throw new Error("showModal failed");
      }),
    };
    const nonOpeningDialog = { open: false, showModal: vi.fn() };
    const modalDialog = {
      open: false,
      showModal: vi.fn(function (this: { open: boolean }) {
        this.open = true;
      }),
    };

    expect(showNativeMediaDialog(unsupportedDialog)).toBe(false);
    expect(showNativeMediaDialog(failingDialog)).toBe(false);
    expect(showNativeMediaDialog(nonOpeningDialog)).toBe(false);
    expect(showNativeMediaDialog(modalDialog)).toBe(true);
    expect(failingDialog.open).toBe(false);
    expect(nonOpeningDialog.open).toBe(false);
    expect(modalDialog.showModal).toHaveBeenCalledOnce();
  });

  it("cancels Strict Mode rehearsal cleanup before restoring trigger focus", () => {
    const scheduled: Array<() => void> = [];
    const cleanup = createCancelableMediaViewerCleanup((callback) => {
      scheduled.push(callback);
    });
    const focus = vi.fn();
    const trigger = { isConnected: true, focus };

    cleanup.schedule(() => restoreFocusToViewerTrigger(trigger));
    cleanup.cancel();
    scheduled.shift()?.();
    expect(focus).not.toHaveBeenCalled();

    cleanup.schedule(() => restoreFocusToViewerTrigger(trigger));
    scheduled.shift()?.();
    expect(focus).toHaveBeenCalledOnce();
  });

  it("restores focus only to the connected trigger", () => {
    const focus = vi.fn();

    expect(restoreFocusToViewerTrigger({ isConnected: true, focus })).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(restoreFocusToViewerTrigger({ isConnected: false, focus })).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(restoreFocusToViewerTrigger(null)).toBe(false);
  });

  it("stops and resets video state", () => {
    const video = {
      currentTime: 31,
      load: vi.fn(),
      pause: vi.fn(),
    };

    resetViewerVideo(video);

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(0);
    expect(video.load).toHaveBeenCalledTimes(1);
  });
});
