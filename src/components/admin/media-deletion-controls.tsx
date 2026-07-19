"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useFormStatus } from "react-dom";

import {
  deleteGalleryMediaAction,
  retryGalleryMediaDeletionAction,
} from "@/app/admin/galleries/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DeletePendingMediaControlItem = {
  id: string;
  originalFilename: string;
  mediaKind: "image" | "video";
  deletionRequestedAt: Date | null;
  deletionAttempts: number;
  nextDeletionAttemptAt: Date | null;
  deletionFailedAt: Date | null;
  hasRecoverableFailure: boolean;
  retryAvailable: boolean;
};

export function AdminMediaDeletionControl({
  galleryId,
  mediaId,
  originalFilename,
}: {
  galleryId: string;
  mediaId: string;
  originalFilename: string;
}) {
  const confirmationId = useId();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `${confirmationId}-title`;
  const descriptionId = `${confirmationId}-description`;

  useEffect(() => {
    if (confirmationOpen) {
      cancelButtonRef.current?.focus();
    }
  }, [confirmationOpen]);

  function cancelConfirmation() {
    setConfirmationOpen(false);
    queueMicrotask(() => restoreFocusToDeletionTrigger(deleteButtonRef.current));
  }

  if (!confirmationOpen) {
    return (
      <button
        ref={deleteButtonRef}
        type="button"
        className={cn(
          buttonVariants({ variant: "destructive", size: "sm" }),
          "border border-destructive/25",
        )}
        aria-label={getDeleteMediaActionLabel(originalFilename)}
        onClick={() => setConfirmationOpen(true)}
      >
        <Trash2 aria-hidden="true" />
        Delete media
      </button>
    );
  }

  return (
    <MediaDeleteConfirmation
      galleryId={galleryId}
      mediaId={mediaId}
      originalFilename={originalFilename}
      titleId={titleId}
      descriptionId={descriptionId}
      cancelButtonRef={cancelButtonRef}
      onCancel={cancelConfirmation}
    />
  );
}

export function MediaDeleteConfirmation({
  galleryId,
  mediaId,
  originalFilename,
  titleId,
  descriptionId,
  cancelButtonRef,
  onCancel,
}: {
  galleryId: string;
  mediaId: string;
  originalFilename: string;
  titleId: string;
  descriptionId: string;
  cancelButtonRef?: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
}) {
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
      onKeyDown={(event) => {
        if (isDeletionCancelKey(event.key)) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div>
        <p id={titleId} className="font-semibold text-destructive">
          Delete {originalFilename}?
        </p>
        <p id={descriptionId} className="mt-1 text-muted-foreground">
          This permanently deletes this media item. This cannot be undone.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={deleteGalleryMediaAction}>
          <input type="hidden" name="galleryId" value={galleryId} />
          <input type="hidden" name="photoId" value={mediaId} />
          <MediaDeleteSubmitButton
            filename={originalFilename}
            descriptionId={descriptionId}
          />
        </form>
        <button
          ref={cancelButtonRef}
          type="button"
          className={buttonVariants({ variant: "outline", size: "sm" })}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AdminDeletePendingMediaList({
  galleryId,
  items,
}: {
  galleryId: string;
  items: DeletePendingMediaControlItem[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-6 space-y-3" aria-live="polite">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
          aria-labelledby={`delete-pending-${item.id}-title`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 id={`delete-pending-${item.id}-title`} className="font-semibold">
                Deleting {item.originalFilename}
              </h3>
              <p className="mt-1 text-muted-foreground">
                {getDeletePendingMediaStatus(item)}
              </p>
            </div>
            <form action={retryGalleryMediaDeletionAction}>
              <input type="hidden" name="galleryId" value={galleryId} />
              <input type="hidden" name="photoId" value={item.id} />
              <RetryDeletionSubmitButton
                filename={item.originalFilename}
                disabled={!item.retryAvailable}
              />
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}

function MediaDeleteSubmitButton({
  filename,
  descriptionId,
}: {
  filename: string;
  descriptionId: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={cn(
        buttonVariants({ variant: "destructive", size: "sm" }),
        "border border-destructive/25",
      )}
      aria-describedby={descriptionId}
      disabled={pending}
    >
      <Trash2 aria-hidden="true" />
      {pending ? `Deleting ${filename}…` : "Delete"}
    </button>
  );
}

function RetryDeletionSubmitButton({
  filename,
  disabled,
}: {
  filename: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  const unavailable = disabled || pending;

  return (
    <button
      type="submit"
      className={buttonVariants({ variant: "outline", size: "sm" })}
      aria-label={`Retry deleting ${filename}`}
      disabled={unavailable}
    >
      <RotateCcw aria-hidden="true" />
      {pending ? "Retrying…" : disabled ? "Retry scheduled" : "Retry deletion"}
    </button>
  );
}

export function getDeleteMediaActionLabel(filename: string) {
  return `Delete media ${filename}`;
}

export function getDeletePendingMediaStatus(item: DeletePendingMediaControlItem) {
  if (item.hasRecoverableFailure) {
    return item.retryAvailable
      ? "Deletion did not finish. Some stored files could not be removed. Retry deletion to continue."
      : "Deletion did not finish. A retry is scheduled soon. This item remains hidden from guests.";
  }

  return "Deletion is in progress. This item is hidden from guests and media asset routes.";
}

export function isDeletionCancelKey(key: string) {
  return key === "Escape";
}

export function restoreFocusToDeletionTrigger(
  trigger: Pick<HTMLButtonElement, "focus" | "isConnected"> | null,
) {
  if (!trigger?.isConnected) return false;

  trigger.focus();
  return true;
}
