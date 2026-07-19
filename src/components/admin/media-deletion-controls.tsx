"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useFormStatus } from "react-dom";

import { deleteGalleryMediaAction } from "@/app/admin/galleries/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminMediaDeletionControl({
  galleryId,
  mediaId,
  originalFilename,
  cursor,
  deletionFailed = false,
}: {
  galleryId: string;
  mediaId: string;
  originalFilename: string;
  cursor?: string;
  deletionFailed?: boolean;
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
      <div className="space-y-2" aria-live="polite">
        {deletionFailed ? (
          <p role="alert" className="text-sm text-destructive">
            Media could not be deleted. Please try again.
          </p>
        ) : null}
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
          {deletionFailed ? "Retry delete" : "Delete media"}
        </button>
      </div>
    );
  }

  return (
    <MediaDeleteConfirmation
      galleryId={galleryId}
      mediaId={mediaId}
      originalFilename={originalFilename}
      cursor={cursor}
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
  cursor,
  titleId,
  descriptionId,
  cancelButtonRef,
  onCancel,
}: {
  galleryId: string;
  mediaId: string;
  originalFilename: string;
  cursor?: string;
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
          {cursor ? <input type="hidden" name="cursor" value={cursor} /> : null}
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

export function getDeleteMediaActionLabel(filename: string) {
  return `Delete media ${filename}`;
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
