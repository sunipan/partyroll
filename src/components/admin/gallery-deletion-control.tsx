"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useFormStatus } from "react-dom";

import { deleteGalleryAction } from "@/app/admin/galleries/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DELETION_FAILURE_COPY = "Deletion could not finish. Try again.";

export function GalleryDeletionControl({
  galleryId,
  galleryName,
  deletionFailed = false,
  confirmationFailed = false,
  isDeleting = false,
}: {
  galleryId: string;
  galleryName: string;
  deletionFailed?: boolean;
  confirmationFailed?: boolean;
  isDeleting?: boolean;
}) {
  const confirmationId = useId();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = `${confirmationId}-title`;
  const descriptionId = `${confirmationId}-description`;

  useEffect(() => {
    if (confirmationOpen) {
      inputRef.current?.focus();
    }
  }, [confirmationOpen]);

  function cancelConfirmation() {
    setConfirmationOpen(false);
    queueMicrotask(() => restoreFocusToGalleryDeletionTrigger(deleteButtonRef.current));
  }

  if (isDeleting) {
    return (
      <GalleryDeletionRetryForm
        galleryId={galleryId}
        galleryName={galleryName}
        deletionFailed={deletionFailed}
      />
    );
  }

  if (!confirmationOpen) {
    return (
      <div className="space-y-2" aria-live="polite">
        {confirmationFailed ? (
          <p role="alert" className="text-sm text-destructive">
            Type the exact gallery name to confirm deletion.
          </p>
        ) : null}
        <button
          ref={deleteButtonRef}
          type="button"
          className={cn(
            buttonVariants({ variant: "destructive", size: "sm" }),
            "border border-destructive/25",
          )}
          aria-label={`Delete gallery ${galleryName}`}
          aria-haspopup="true"
          aria-expanded={confirmationOpen}
          onClick={() => setConfirmationOpen(true)}
        >
          <Trash2 aria-hidden="true" />
          Delete gallery
        </button>
      </div>
    );
  }

  return (
    <GalleryDeleteConfirmation
      galleryId={galleryId}
      galleryName={galleryName}
      titleId={titleId}
      descriptionId={descriptionId}
      inputRef={inputRef}
      cancelButtonRef={cancelButtonRef}
      onCancel={cancelConfirmation}
    />
  );
}

export function GalleryDeleteConfirmation({
  galleryId,
  galleryName,
  titleId,
  descriptionId,
  inputRef,
  cancelButtonRef,
  onCancel,
}: {
  galleryId: string;
  galleryName: string;
  titleId: string;
  descriptionId: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  cancelButtonRef?: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
}) {
  const inputId = `${titleId}-input`;
  const errorId = `${titleId}-error`;
  const [confirmationName, setConfirmationName] = useState("");
  const [submitRejected, setSubmitRejected] = useState(false);
  const matches = isGalleryDeletionConfirmationExact(
    confirmationName,
    galleryName,
  );
  const showMismatch = confirmationName.length > 0 && !matches;
  const hasMismatchError = showMismatch || submitRejected;
  const describedBy = hasMismatchError
    ? `${descriptionId} ${errorId}`
    : descriptionId;

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="w-full space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div>
        <p id={titleId} className="font-semibold text-destructive">
          Delete {galleryName}?
        </p>
        <p id={descriptionId} className="mt-1 text-muted-foreground">
          Guest access ends immediately. Deletion is permanent and removes this
          gallery and its uploaded media.
        </p>
      </div>
      <form
        action={deleteGalleryAction}
        className="space-y-3"
        onSubmit={(event) => {
          if (!matches) {
            event.preventDefault();
            setSubmitRejected(true);
          }
        }}
      >
        <input type="hidden" name="galleryId" value={galleryId} />
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="font-medium">
            Type {galleryName} to confirm
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="confirmationName"
            value={confirmationName}
            onChange={(event) => {
              setConfirmationName(event.target.value);
              setSubmitRejected(false);
            }}
            aria-invalid={hasMismatchError}
            aria-describedby={describedBy}
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
          />
          {hasMismatchError ? (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              The gallery name must match exactly.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <GalleryDeleteSubmitButton
            disabled={!matches}
            pendingLabel={`Deleting ${galleryName}…`}
            label="Delete permanently"
            descriptionId={descriptionId}
          />
          <button
            ref={cancelButtonRef}
            type="button"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function GalleryDeletionRetryForm({
  galleryId,
  galleryName,
  deletionFailed,
}: {
  galleryId: string;
  galleryName: string;
  deletionFailed: boolean;
}) {
  const descriptionId = useId();

  return (
    <form action={deleteGalleryAction} className="w-full space-y-2">
      <input type="hidden" name="galleryId" value={galleryId} />
      <input type="hidden" name="confirmationName" value={galleryName} />
      {deletionFailed ? (
        <p id={descriptionId} role="alert" className="text-sm text-destructive">
          {DELETION_FAILURE_COPY}
        </p>
      ) : null}
      <GalleryDeleteSubmitButton
        pendingLabel={`Retrying deletion of ${galleryName}…`}
        label="Retry deletion"
        descriptionId={deletionFailed ? descriptionId : undefined}
      />
    </form>
  );
}

function GalleryDeleteSubmitButton({
  disabled = false,
  pendingLabel,
  label,
  descriptionId,
}: {
  disabled?: boolean;
  pendingLabel: string;
  label: string;
  descriptionId?: string;
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
      disabled={disabled || pending}
    >
      <Trash2 aria-hidden="true" />
      {pending ? pendingLabel : label}
    </button>
  );
}

export function isGalleryDeletionConfirmationExact(
  candidate: string,
  galleryName: string,
) {
  return candidate === galleryName;
}

export function restoreFocusToGalleryDeletionTrigger(
  trigger: Pick<HTMLButtonElement, "focus" | "isConnected"> | null,
) {
  if (!trigger?.isConnected) return false;

  trigger.focus();
  return true;
}
