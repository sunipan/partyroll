"use client";

import { Download, Video, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
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

export function GalleryMediaViewer({
  items,
  itemActions,
  presentation = "default",
}: {
  items: GalleryMediaViewerItem[];
  itemActions?: ReactNode[];
  presentation?: "default" | "guest";
}) {
  const viewerId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const suppressDialogCloseEventRef = useRef(false);
  const [cleanupScheduler] = useState(createCancelableMediaViewerCleanup);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const activeMedia = getActiveGalleryMediaItem(items, activeMediaId);

  useEffect(() => {
    if (activeMediaId && !activeMedia) {
      const removedMediaId = activeMediaId;
      resetViewerVideo(videoRef.current);
      queueMicrotask(() => {
        setActiveMediaId((current) =>
          current === removedMediaId ? null : current,
        );
      });
    }
  }, [activeMedia, activeMediaId]);

  useEffect(() => {
    if (!activeMedia || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    cleanupScheduler.cancel();

    if (!showNativeMediaDialog(dialog)) {
      resetViewerVideo(videoRef.current);
      setActiveMediaId((current) =>
        current === activeMedia.id ? null : current,
      );
      restoreFocusToViewerTrigger(trigger);
      if (triggerRef.current === trigger) triggerRef.current = null;
      return;
    }

    closeButtonRef.current?.focus();
    const activeVideo = videoRef.current;

    return () => {
      resetViewerVideo(activeVideo);
      cleanupScheduler.schedule(() => {
        if (dialog.open && typeof dialog.close === "function") {
          suppressDialogCloseEventRef.current = true;
          dialog.close();
          setTimeout(() => {
            suppressDialogCloseEventRef.current = false;
          }, 0);
        }
        restoreFocusToViewerTrigger(trigger);
        if (triggerRef.current === trigger) triggerRef.current = null;
      });
    };
  }, [activeMedia, cleanupScheduler]);

  function openViewer(mediaId: string, trigger: HTMLElement) {
    cleanupScheduler.cancel();
    resetViewerVideo(videoRef.current);
    triggerRef.current = trigger;
    setActiveMediaId(mediaId);
  }

  function closeViewer() {
    resetViewerVideo(videoRef.current);
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") {
      dialog.close();
      return;
    }
    setActiveMediaId(null);
  }

  function handleDialogCancel() {
    resetViewerVideo(videoRef.current);
  }

  function handleDialogClose() {
    if (suppressDialogCloseEventRef.current) return;
    resetViewerVideo(videoRef.current);
    setActiveMediaId(null);
  }

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) closeViewer();
  }

  return (
    <>
      <div
        className={
          presentation === "guest"
            ? "grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
            : "grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {items.map((media, index) => {
          const nameId = `${viewerId}-${media.id}-name`;
          const detailsId = `${viewerId}-${media.id}-details`;
          return (
            <article
              key={media.id}
              aria-labelledby={nameId}
              className={
                presentation === "guest"
                  ? "motion-interactive min-w-0 overflow-hidden rounded-xl border border-primary/15 bg-card shadow-[var(--shadow-paper)] hover:border-primary/30"
                  : "min-w-0 overflow-hidden rounded-xl border border-primary/10 bg-card shadow-[var(--shadow-control)]"
              }
            >
              <button
                type="button"
                aria-describedby={detailsId}
                aria-haspopup="dialog"
                aria-label={getOpenViewerActionLabel(media)}
                className={cn(
                  "group block w-full overflow-hidden bg-muted text-left outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50",
                  presentation === "guest" && "focus-visible:ring-inset",
                )}
                onClick={(event) => openViewer(media.id, event.currentTarget)}
              >
                {media.mediaKind === "image" ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- Private media uses authenticated same-origin routes. */
                  <img
                    src={media.thumbnailUrl ?? media.displayUrl}
                    alt=""
                    className={cn(
                      "aspect-square w-full object-cover transition",
                      presentation === "guest"
                        ? "group-hover:scale-[1.015]"
                        : "group-hover:scale-[1.01]",
                    )}
                    loading="lazy"
                  />
                ) : (
                  <span className="relative block aspect-square w-full overflow-hidden bg-black text-white">
                    <video
                      src={getGalleryVideoPreviewSource(media)}
                      aria-hidden="true"
                      muted
                      playsInline
                      preload="metadata"
                      className={cn(
                        "pointer-events-none size-full object-cover transition",
                        presentation === "guest"
                          ? "group-hover:scale-[1.015]"
                          : "group-hover:scale-[1.01]",
                      )}
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-xs font-semibold shadow-sm",
                        presentation === "guest" && "border border-white/20",
                      )}
                    >
                      <Video className="size-3.5" />
                      Video
                    </span>
                  </span>
                )}
              </button>
              <div className={presentation === "guest" ? "space-y-3 p-2.5 sm:p-4" : "min-w-0 space-y-2.5 p-2.5 sm:p-3"}>
                <div>
                  <p
                    id={nameId}
                    className={cn(
                      "truncate font-medium",
                      presentation === "guest" && "text-sm sm:text-base",
                    )}
                  >
                    {media.originalFilename}
                  </p>
                  <p id={detailsId} className="mt-1 text-xs text-muted-foreground">
                    {formatGalleryMediaDetails(media)}
                  </p>
                </div>
                <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap">
                  <a
                    href={media.downloadUrl}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className:
                        presentation === "guest"
                          ? "h-10 w-full min-w-0 px-2.5 sm:w-auto"
                          : "w-full min-w-0 px-2 sm:w-auto",
                    })}
                    download={media.originalFilename}
                    aria-label={getDownloadViewerActionLabel(media)}
                  >
                    {presentation === "guest" ? (
                      <>
                        <Download aria-hidden="true" />
                        Download
                        <span className="sr-only"> original {media.originalFilename}</span>
                      </>
                    ) : (
                      <>
                        <Download aria-hidden="true" />
                        Download
                        <span className="sr-only"> original {media.originalFilename}</span>
                      </>
                    )}
                  </a>
                  {itemActions?.[index] ? (
                    <div className="min-w-0 break-words [&>div]:w-full [&_button]:w-full sm:[&>div]:w-auto sm:[&_button]:w-auto">
                      {itemActions[index]}
                    </div>
                  ) : null}
                </div>
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
          onClose={handleDialogClose}
          onClick={handleDialogClick}
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
  onClose,
  onClick,
  onRequestClose,
}: {
  media: GalleryMediaViewerItem;
  titleId: string;
  descriptionId: string;
  dialogRef?: RefObject<HTMLDialogElement | null>;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onCancel?: (event: SyntheticEvent<HTMLDialogElement, Event>) => void;
  onClose?: (event: SyntheticEvent<HTMLDialogElement, Event>) => void;
  onClick?: (event: MouseEvent<HTMLDialogElement>) => void;
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
      onClose={onClose}
      onClick={onClick}
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

export function getGalleryVideoPreviewSource(media: GalleryMediaViewerItem) {
  return `${media.displayUrl.split("#", 1)[0]}#t=0.001`;
}

export function getActiveGalleryMediaItem(
  items: readonly GalleryMediaViewerItem[],
  activeMediaId: string | null,
) {
  if (!activeMediaId) return null;
  return items.find((item) => item.id === activeMediaId) ?? null;
}

export function showNativeMediaDialog(
  dialog: Pick<HTMLDialogElement, "open"> &
    Partial<Pick<HTMLDialogElement, "showModal">>,
) {
  if (dialog.open) return true;
  if (typeof dialog.showModal !== "function") return false;

  try {
    dialog.showModal();
  } catch {
    return false;
  }

  return dialog.open;
}

export function createCancelableMediaViewerCleanup(
  schedule: (callback: () => void) => void = queueMicrotask,
) {
  let token = 0;

  return {
    cancel() {
      token += 1;
    },
    schedule(cleanup: () => void) {
      const scheduledToken = token + 1;
      token = scheduledToken;
      schedule(() => {
        if (token === scheduledToken) cleanup();
      });
    },
  };
}

export function formatGalleryMediaDetails(media: GalleryMediaViewerItem) {
  const dimensions = media.width && media.height ? `${media.width}×${media.height}` : null;
  return [media.mediaKind === "image" ? "Image" : "Video", dimensions, formatByteSize(media.originalByteSize)]
    .filter(Boolean)
    .join(" · ");
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
