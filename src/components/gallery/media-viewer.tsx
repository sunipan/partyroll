"use client";

import { Download, Video, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GalleryMediaViewerItem = {
  id: string;
  originalFilename: string;
  mediaKind: "image" | "video";
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string | null;
  downloadUrl: string;
  originalByteSize: number;
  width: number | null;
  height: number | null;
};

export function GalleryMediaViewer({ items }: { items: GalleryMediaViewerItem[] }) {
  const viewerId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [activeMedia, setActiveMedia] = useState<GalleryMediaViewerItem | null>(null);

  useEffect(() => {
    if (!activeMedia || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
    }
    closeButtonRef.current?.focus();
    const activeVideo = videoRef.current;

    return () => {
      resetViewerVideo(activeVideo);
      if (dialog.open && typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
      restoreFocusToViewerTrigger(trigger);
      if (triggerRef.current === trigger) triggerRef.current = null;
    };
  }, [activeMedia]);

  function openViewer(media: GalleryMediaViewerItem, trigger: HTMLElement) {
    resetViewerVideo(videoRef.current);
    triggerRef.current = trigger;
    setActiveMedia(media);
  }

  function closeViewer() {
    resetViewerVideo(videoRef.current);
    setActiveMedia(null);
  }

  function handleDialogCancel(event: SyntheticEvent<HTMLDialogElement, Event>) {
    event.preventDefault();
    closeViewer();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (!shouldDismissMediaViewerKey(event.key)) return;
    event.preventDefault();
    closeViewer();
  }

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) closeViewer();
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((media) => {
          const nameId = `${viewerId}-${media.id}-name`;
          const detailsId = `${viewerId}-${media.id}-details`;
          return (
            <article
              key={media.id}
              aria-labelledby={nameId}
              className="overflow-hidden rounded-xl border bg-card shadow-xs"
            >
              <button
                type="button"
                aria-describedby={detailsId}
                aria-haspopup="dialog"
                aria-label={getOpenViewerActionLabel(media)}
                className="group block w-full overflow-hidden bg-muted text-left outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={(event) => openViewer(media, event.currentTarget)}
              >
                {media.mediaKind === "image" ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- Private media uses authenticated same-origin routes. */
                  <img
                    src={media.thumbnailUrl ?? media.displayUrl}
                    alt=""
                    className="aspect-square w-full object-cover transition group-hover:scale-[1.01]"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex aspect-square w-full flex-col items-center justify-center gap-3 bg-black text-white">
                    <Video aria-hidden="true" className="size-10" />
                    <span className="text-sm font-medium">Video</span>
                  </span>
                )}
              </button>
              <div className="space-y-3 p-3">
                <div>
                  <p id={nameId} className="truncate font-medium">
                    {media.originalFilename}
                  </p>
                  <p id={detailsId} className="mt-1 text-xs text-muted-foreground">
                    {formatGalleryMediaDetails(media)}
                  </p>
                </div>
                <a
                  href={media.downloadUrl}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  download={media.originalFilename}
                  aria-label={getDownloadViewerActionLabel(media)}
                >
                  Download original<span className="sr-only"> {media.originalFilename}</span>
                </a>
              </div>
            </article>
          );
        })}
      </div>

      {activeMedia ? (
        <GalleryMediaDialog
          media={activeMedia}
          titleId={`${viewerId}-dialog-title`}
          descriptionId={`${viewerId}-dialog-description`}
          dialogRef={dialogRef}
          closeButtonRef={closeButtonRef}
          videoRef={videoRef}
          onCancel={handleDialogCancel}
          onClick={handleDialogClick}
          onKeyDown={handleDialogKeyDown}
          onRequestClose={closeViewer}
        />
      ) : null}
    </>
  );
}

export function GalleryMediaDialog({
  media,
  titleId,
  descriptionId,
  dialogRef,
  closeButtonRef,
  videoRef,
  onCancel,
  onClick,
  onKeyDown,
  onRequestClose,
}: {
  media: GalleryMediaViewerItem;
  titleId: string;
  descriptionId: string;
  dialogRef?: RefObject<HTMLDialogElement | null>;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onCancel?: (event: SyntheticEvent<HTMLDialogElement, Event>) => void;
  onClick?: (event: MouseEvent<HTMLDialogElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDialogElement>) => void;
  onRequestClose: () => void;
}) {
  return (
    <dialog
      ref={dialogRef}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="m-auto max-h-[90dvh] w-[min(64rem,calc(100%-2rem))] overflow-hidden rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/70"
      onCancel={onCancel}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b bg-card p-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {media.originalFilename}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
              {formatGalleryMediaDetails(media)}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Close media viewer"
            onClick={onRequestClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-black">
          {media.mediaKind === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element -- Private media uses authenticated same-origin routes. */
            <img
              key={media.id}
              src={getViewerMediaSource(media)}
              alt={`Preview of ${media.originalFilename}`}
              className="mx-auto max-h-[70dvh] w-full object-contain"
            />
          ) : (
            <video
              key={media.id}
              ref={videoRef}
              controls
              preload="metadata"
              src={getViewerMediaSource(media)}
              className="mx-auto max-h-[70dvh] w-full bg-black"
              aria-label={`Video preview of ${media.originalFilename}`}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t bg-card p-4">
          <a
            href={media.downloadUrl}
            className={cn(buttonVariants({ variant: "outline" }), "max-w-full")}
            download={media.originalFilename}
          >
            <Download aria-hidden="true" />
            <span className="truncate">{getDownloadViewerActionLabel(media)}</span>
          </a>
        </div>
      </div>
    </dialog>
  );
}

export function getOpenViewerActionLabel(media: GalleryMediaViewerItem) {
  return `View ${media.mediaKind} ${media.originalFilename}`;
}

export function getDownloadViewerActionLabel(media: GalleryMediaViewerItem) {
  return `Download original ${media.originalFilename}`;
}

export function getViewerMediaSource(media: GalleryMediaViewerItem) {
  return media.mediaKind === "image" ? media.displayUrl : media.originalUrl;
}

export function formatGalleryMediaDetails(media: GalleryMediaViewerItem) {
  const dimensions = media.width && media.height ? `${media.width}×${media.height}` : null;
  return [media.mediaKind === "image" ? "Image" : "Video", dimensions, formatByteSize(media.originalByteSize)]
    .filter(Boolean)
    .join(" · ");
}

export function shouldDismissMediaViewerKey(key: string) {
  return key === "Escape";
}

export function restoreFocusToViewerTrigger(trigger: Pick<HTMLElement, "focus" | "isConnected"> | null) {
  if (!trigger?.isConnected) return false;
  trigger.focus();
  return true;
}

export function resetViewerVideo(video: Pick<HTMLVideoElement, "currentTime" | "load" | "pause"> | null) {
  if (!video) return;
  video.pause();
  video.currentTime = 0;
  video.load();
}

function formatByteSize(byteSize: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    style: "unit",
    unit: byteSize >= 1024 * 1024 ? "megabyte" : "kilobyte",
    unitDisplay: "short",
  }).format(byteSize / (byteSize >= 1024 * 1024 ? 1024 * 1024 : 1024));
}
