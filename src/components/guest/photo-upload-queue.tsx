"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, RotateCcw, Trash2, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  getMaxSourceBytesForMediaKind,
  getMediaKindForMimeType,
  getUploadSizeLimitMegabytes,
  MAX_SELECTED_UPLOADS,
  supportedUploadMimeTypes,
  type SupportedUploadMimeType,
} from "@/lib/uploads/client-limits";

import { createCoalescedRefresh, type CoalescedRefresh } from "./coalesced-refresh";

const CONCURRENT_UPLOADS = 3;
const RESERVATION_REQUEST_TIMEOUT_MILLISECONDS = 30 * 1000;
const COMPLETION_REQUEST_TIMEOUT_MILLISECONDS = 2 * 60 * 1000;
const DIRECT_UPLOAD_TIMEOUT_MILLISECONDS = 8 * 60 * 1000;

type UploadStatus =
  | "selected"
  | "reserving"
  | "uploading"
  | "processing"
  | "ready"
  | "error";

type UploadItem = {
  localId: string;
  idempotencyKey: string;
  file?: File;
  fileName: string;
  fileSize: number;
  previewUrl?: string;
  mimeType: SupportedUploadMimeType;
  status: UploadStatus;
  progress: number;
  photoId?: string;
  sourceUploaded: boolean;
  canRetry?: boolean;
  error?: string;
};

type ReservationResponse = {
  photoId: string;
  status: "pending" | "ready";
  uploadUrl?: string;
};

export function PhotoUploadQueue({ slug }: { slug: string }) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<UploadItem[]>([]);
  const uploadRunActiveRef = useRef(false);
  const activeAbortControllersRef = useRef(new Set<AbortController>());
  const galleryRefreshRef = useRef<CoalescedRefresh | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    const galleryRefresh = createCoalescedRefresh(() => router.refresh());
    galleryRefreshRef.current = galleryRefresh;

    return () => {
      galleryRefresh.cancel();
      if (galleryRefreshRef.current === galleryRefresh) {
        galleryRefreshRef.current = null;
      }
    };
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    const activeAbortControllers = activeAbortControllersRef.current;

    return () => {
      mountedRef.current = false;
      for (const controller of activeAbortControllers) {
        controller.abort();
      }
      activeAbortControllers.clear();
      for (const item of itemsRef.current) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, []);

  function replaceItems(update: (current: UploadItem[]) => UploadItem[]) {
    const next = update(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }

  function updateItem(localId: string, update: Partial<UploadItem>) {
    if (!mountedRef.current) {
      return;
    }

    replaceItems((current) =>
      current.map((item) =>
        item.localId === localId ? { ...item, ...update } : item,
      ),
    );
  }

  function markSourceUploaded(localId: string, photoId: string) {
    const item = itemsRef.current.find(
      (candidate) => candidate.localId === localId,
    );
    if (!item) {
      return;
    }
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    updateItem(localId, {
      photoId,
      sourceUploaded: true,
      status: "processing",
      progress: 96,
      file: undefined,
      previewUrl: undefined,
    });
  }

  function markItemReady(localId: string, photoId?: string) {
    const item = itemsRef.current.find(
      (candidate) => candidate.localId === localId,
    );
    if (!item) {
      return;
    }
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    updateItem(localId, {
      photoId: photoId ?? item.photoId,
      sourceUploaded: true,
      status: "ready",
      progress: 100,
      file: undefined,
      previewUrl: undefined,
    });
    galleryRefreshRef.current?.schedule();
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length || uploadRunActiveRef.current) {
      return;
    }

    const available = MAX_SELECTED_UPLOADS - itemsRef.current.length;
    if (available <= 0) {
      setSelectionError(`You can queue up to ${MAX_SELECTED_UPLOADS} files.`);
      return;
    }

    const selectedFiles = Array.from(files).slice(0, available);
    const accepted: UploadItem[] = [];
    const errors: string[] = [];

    for (const file of selectedFiles) {
      const mimeType = getSupportedMimeType(file);
      if (!mimeType) {
        errors.push(`${file.name} is not a supported image or video.`);
        continue;
      }
      const mediaKind = getMediaKindForMimeType(mimeType);
      if (
        file.size <= 0 ||
        file.size > getMaxSourceBytesForMediaKind(mediaKind)
      ) {
        errors.push(
          `${file.name} must be ${getUploadSizeLimitMegabytes(mediaKind)} MB or smaller.`,
        );
        continue;
      }

      accepted.push({
        localId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileSize: file.size,
        previewUrl: isImageMimeType(mimeType) ? URL.createObjectURL(file) : undefined,
        mimeType,
        status: "selected",
        progress: 0,
        sourceUploaded: false,
      });
    }

    replaceItems((current) => [...current, ...accepted]);
    setSelectionError(
      files.length > available
        ? `Only the first ${available} files were added. The queue holds ${MAX_SELECTED_UPLOADS}.`
        : errors[0] ?? null,
    );
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function removeItem(localId: string) {
    if (uploadRunActiveRef.current) {
      return;
    }

    replaceItems((current) => {
      const item = current.find((candidate) => candidate.localId === localId);
      if (!item || (item.status !== "selected" && item.status !== "error")) {
        return current;
      }
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return current.filter((candidate) => candidate.localId !== localId);
    });
  }

  async function uploadItem(item: UploadItem, signal: AbortSignal) {
    if (
      signal.aborted ||
      !itemsRef.current.some((candidate) => candidate.localId === item.localId)
    ) {
      return;
    }

    try {
      updateItem(item.localId, {
        status: "reserving",
        progress: 0,
        error: undefined,
        canRetry: undefined,
      });

      if (item.photoId && item.sourceUploaded) {
        updateItem(item.localId, { status: "processing", progress: 96 });
        await completeUpload(item.photoId, signal);
        markItemReady(item.localId);
        return;
      }

      const reservation = await reserveUpload(item, signal);
      if (reservation.status === "ready") {
        markItemReady(item.localId, reservation.photoId);
        return;
      }
      if (!reservation.uploadUrl) {
        throw new Error("The upload reservation was incomplete.");
      }

      updateItem(item.localId, {
        photoId: reservation.photoId,
        status: "uploading",
        progress: 1,
      });
      if (!item.file) {
        throw new NonRetryableUploadError(
          "The selected file is no longer available. Choose it again.",
        );
      }
      await uploadDirectlyToR2({
        uploadUrl: reservation.uploadUrl,
        item,
        onProgress: (progress) =>
          updateItem(item.localId, { progress: Math.min(progress, 95) }),
        signal,
      });

      markSourceUploaded(item.localId, reservation.photoId);
      await completeUpload(reservation.photoId, signal);
      markItemReady(item.localId, reservation.photoId);
    } catch (error) {
      updateItem(item.localId, {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "This file could not be uploaded.",
        canRetry: !(error instanceof NonRetryableUploadError),
      });
    }
  }

  async function uploadQueuedItems() {
    const queued = itemsRef.current.filter(
      (item) =>
        item.status === "selected" ||
        (item.status === "error" && item.canRetry),
    );
    await runUploadItems(queued);
  }

  async function retryItem(item: UploadItem) {
    if (
      item.status !== "error" ||
      !item.canRetry ||
      !itemsRef.current.some((candidate) => candidate.localId === item.localId)
    ) {
      return;
    }
    await runUploadItems([item]);
  }

  async function runUploadItems(queued: UploadItem[]) {
    if (queued.length === 0 || uploadRunActiveRef.current) {
      return;
    }

    uploadRunActiveRef.current = true;
    setIsUploading(true);
    const controller = new AbortController();
    activeAbortControllersRef.current.add(controller);
    let nextIndex = 0;

    try {
      async function worker() {
        while (!controller.signal.aborted && nextIndex < queued.length) {
          const item = queued[nextIndex];
          nextIndex += 1;
          await uploadItem(item, controller.signal);
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENT_UPLOADS, queued.length) },
          worker,
        ),
      );
    } finally {
      activeAbortControllersRef.current.delete(controller);
      uploadRunActiveRef.current = false;
      if (mountedRef.current) {
        setIsUploading(false);
      }
    }
  }

  async function reserveUpload(
    item: UploadItem,
    signal: AbortSignal,
  ): Promise<ReservationResponse> {
    if (!item.file) {
      throw new NonRetryableUploadError(
        "The selected file is no longer available. Choose it again.",
      );
    }
    const response = await fetchWithTimeout(
      "/api/guest/uploads/reserve",
      {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        idempotencyKey: item.idempotencyKey,
        mimeType: item.mimeType,
        byteSize: item.fileSize,
        originalFilename: item.fileName,
      }),
      },
      signal,
      RESERVATION_REQUEST_TIMEOUT_MILLISECONDS,
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !isReservationResponse(body)) {
      const message = readErrorMessage(
        body,
        "This file could not be reserved.",
      );
      if (response.status === 400 || response.status === 403 || response.status === 409) {
        throw new NonRetryableUploadError(message);
      }
      throw new Error(message);
    }
    return body;
  }

  async function completeUpload(photoId: string, signal: AbortSignal) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetchWithTimeout(
        `/api/guest/uploads/${encodeURIComponent(photoId)}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug }),
        },
        signal,
        COMPLETION_REQUEST_TIMEOUT_MILLISECONDS,
      );
      const body: unknown = await response.json().catch(() => null);

      if (response.ok && hasReadyStatus(body)) {
        return;
      }
      if (response.status === 202 || response.status === 503) {
        await delay(readRetryAfterMilliseconds(response), signal);
        continue;
      }
      if (response.status === 422 || response.status === 409) {
        throw new NonRetryableUploadError(
          readErrorMessage(body, "This file could not be processed."),
        );
      }
      throw new Error(readErrorMessage(body, "This file could not be processed."));
    }

    throw new Error("Processing is taking longer than expected. Retry shortly.");
  }

  const readyCount = items.filter((item) => item.status === "ready").length;
  const queuedCount = items.filter(
    (item) =>
      item.status === "selected" ||
      (item.status === "error" && item.canRetry),
  ).length;

  return (
    <Card className="mb-10">
      <CardHeader>
        <CardTitle>Add photos and videos</CardTitle>
        <CardDescription>
          Choose up to 100 photos or videos. Partyroll uploads three at a time,
          keeps originals private, prepares image display copies, and stores
          videos as private originals only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading || items.length >= MAX_SELECTED_UPLOADS}
          >
            <ImagePlus aria-hidden="true" />
            Choose files
          </Button>
          <Input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,.heic,.heif,.mp4,.mov,.webm"
            multiple
            onChange={(event) => handleFiles(event.target.files)}
            aria-label="Choose photos or videos to upload"
          />
          {queuedCount > 0 ? (
            <Button
              type="button"
              onClick={uploadQueuedItems}
              disabled={isUploading}
            >
              {isUploading ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              Upload {queuedCount} {queuedCount === 1 ? "file" : "files"}
            </Button>
          ) : null}
        </div>

        <div aria-live="polite" className="text-sm text-muted-foreground">
          {selectionError ? (
            <p className="text-destructive">{selectionError}</p>
          ) : items.length > 0 ? (
            <p>
              {readyCount} of {items.length} files uploaded.
            </p>
          ) : (
            <p>
              JPEG, PNG, WebP, HEIC, and HEIF images up to 100 MB; MP4, MOV,
              and WebM videos up to 150 MB.
            </p>
          )}
        </div>

        {items.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <li
                key={item.localId}
                className="flex gap-3 rounded-xl border bg-background p-3"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {item.previewUrl ? (
                    <Image
                      src={item.previewUrl}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : item.status !== "ready" && isVideoMimeType(item.mimeType) ? (
                    <div className="flex size-full items-center justify-center text-primary">
                      <Video aria-hidden="true" className="size-7" />
                    </div>
                  ) : (
                    <div className="flex size-full items-center justify-center text-primary">
                      <Check aria-hidden="true" className="size-7" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(item.fileSize)} · {getStatusLabel(item.status)}
                      </p>
                    </div>
                    {item.status === "ready" ? (
                      <Check aria-label="Uploaded" className="size-5 text-primary" />
                    ) : item.status === "error" && item.canRetry ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => retryItem(item)}
                        disabled={isUploading}
                        aria-label={`Retry ${item.fileName}`}
                      >
                        <RotateCcw aria-hidden="true" />
                      </Button>
                    ) : item.status === "error" || item.status === "selected" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeItem(item.localId)}
                        disabled={isUploading}
                        aria-label={`Remove ${item.fileName}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                  <Progress value={item.progress} aria-label={`${item.fileName} progress`} />
                  {item.error ? (
                    <p className="text-xs text-destructive">{item.error}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function uploadDirectlyToR2({
  uploadUrl,
  item,
  onProgress,
  signal,
}: {
  uploadUrl: string;
  item: UploadItem;
  onProgress: (progress: number) => void;
  signal: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The file upload was cancelled.", "AbortError"));
      return;
    }

    if (!item.file) {
      reject(new Error("The selected file is no longer available."));
      return;
    }

    const request = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", handleSignalAbort);
      callback();
    };
    const handleSignalAbort = () => request.abort();

    request.open("PUT", uploadUrl);
    request.timeout = DIRECT_UPLOAD_TIMEOUT_MILLISECONDS;
    request.setRequestHeader("content-type", item.mimeType);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 94));
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        finish(resolve);
      } else {
        finish(() =>
          reject(new Error("The direct file upload failed. Please retry.")),
        );
      }
    });
    request.addEventListener("error", () =>
      finish(() =>
        reject(new Error("The file upload lost its connection. Please retry.")),
      ),
    );
    request.addEventListener("timeout", () =>
      finish(() => reject(new Error("The file upload timed out. Please retry."))),
    );
    request.addEventListener("abort", () =>
      finish(() =>
        reject(new DOMException("The file upload was cancelled.", "AbortError")),
      ),
    );
    signal.addEventListener("abort", handleSignalAbort, { once: true });
    request.send(item.file);
  });
}

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  parentSignal: AbortSignal,
  timeoutMilliseconds: number,
): Promise<Response> {
  if (parentSignal.aborted) {
    return Promise.reject(
      new DOMException("The upload was cancelled.", "AbortError"),
    );
  }

  const controller = new AbortController();
  const handleParentAbort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", handleParentAbort, { once: true });
  const timeout = window.setTimeout(
    () => controller.abort(new DOMException("The request timed out.", "TimeoutError")),
    timeoutMilliseconds,
  );

  return fetch(input, { ...init, signal: controller.signal })
    .catch((error: unknown) => {
      if (!parentSignal.aborted && controller.signal.aborted) {
        throw new Error("The request timed out. Please retry.");
      }
      throw error;
    })
    .finally(() => {
      window.clearTimeout(timeout);
      parentSignal.removeEventListener("abort", handleParentAbort);
    });
}

function getSupportedMimeType(file: File): SupportedUploadMimeType | null {
  if (
    supportedUploadMimeTypes.includes(file.type as SupportedUploadMimeType)
  ) {
    return file.type as SupportedUploadMimeType;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "heic") {
    return "image/heic";
  }
  if (extension === "heif") {
    return "image/heif";
  }
  if (extension === "mp4") {
    return "video/mp4";
  }
  if (extension === "mov") {
    return "video/quicktime";
  }
  if (extension === "webm") {
    return "video/webm";
  }
  return null;
}

function isImageMimeType(mimeType: SupportedUploadMimeType) {
  return getMediaKindForMimeType(mimeType) === "image";
}

function isVideoMimeType(mimeType: SupportedUploadMimeType) {
  return getMediaKindForMimeType(mimeType) === "video";
}

function isReservationResponse(value: unknown): value is ReservationResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "photoId" in value &&
      typeof value.photoId === "string" &&
      "status" in value &&
      (value.status === "pending" || value.status === "ready") &&
      (!("uploadUrl" in value) || typeof value.uploadUrl === "string"),
  );
}

function hasReadyStatus(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      value.status === "ready",
  );
}

function readErrorMessage(value: unknown, fallback: string) {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

class NonRetryableUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableUploadError";
  }
}

function getStatusLabel(status: UploadStatus) {
  switch (status) {
    case "selected":
      return "Ready";
    case "reserving":
      return "Preparing";
    case "uploading":
      return "Uploading";
    case "processing":
      return "Processing";
    case "ready":
      return "Uploaded";
    case "error":
      return "Needs attention";
  }
}

function formatBytes(value: number) {
  return new Intl.NumberFormat("en", {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  }).format(value / 1024 / 1024);
}

function readRetryAfterMilliseconds(response: Response) {
  const seconds = Number(response.headers.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 2000;
  }
  return Math.min(seconds * 1000, 10_000);
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The upload was cancelled.", "AbortError"));
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}
