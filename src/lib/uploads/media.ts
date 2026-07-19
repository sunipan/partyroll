import "server-only";

import {
  getAdminMediaAssetPath,
  getGuestMediaAssetPath,
  resolveMediaAssetVariant,
  type MediaAssetVariant,
} from "@/lib/media-assets";
import type { Photo } from "@/db/schema";
import type { ReadyMediaPage } from "./ready-media-pagination";

import { deleteUploadObjects, getMediaDeletionObjectKeys } from "./objects";
import {
  claimReadyMediaDeletionForOwner,
  deletePendingMediaRecord,
  getRetryableDeletePendingMediaForOwner,
  listReadyMediaForGuest,
  listReadyMediaForOwner,
  recordMediaDeletionFailure,
  type ReadyMedia,
} from "./queries";

type ReadyMediaViewBase = Omit<
  ReadyMedia,
  | "mediaKind"
  | "quarantineObjectKey"
  | "originalFilename"
  | "mimeType"
  | "byteSize"
  | "originalObjectKey"
  | "displayObjectKey"
  | "thumbnailObjectKey"
  | "width"
  | "height"
> & {
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  originalByteSize: number;
  originalUrl: string;
  displayUrl: string;
  downloadUrl: string;
};

export type ReadyMediaView =
  | (ReadyMediaViewBase & {
      mediaKind: "image";
      width: number;
      height: number;
      thumbnailUrl: string;
    })
  | (ReadyMediaViewBase & {
      mediaKind: "video";
      width: null;
      height: null;
      thumbnailUrl: null;
    });

export type DeleteReadyMediaResult =
  | { outcome: "deleted"; media: Photo }
  | { outcome: "retry-pending"; media: Photo }
  | { outcome: "not-found" };

export type RetryPendingMediaDeletionResult = DeleteReadyMediaResult;

export async function listReadyMediaForGuestGallery(input: {
  galleryId: string;
  slug: string;
  accessVersion: number;
  cursor?: string;
}): Promise<ReadyMediaPage<ReadyMediaView>> {
  const page = await listReadyMediaForGuest(input);

  return {
    ...page,
    items: page.items.map((item) =>
      createReadyMediaView(item, (variant) =>
        getGuestMediaAssetPath({
          slug: input.slug,
          mediaId: item.id,
          variant,
        }),
      ),
    ),
  };
}

export async function listReadyMediaForOwnerGallery(input: {
  ownerClerkId: string;
  galleryId: string;
  cursor?: string;
}): Promise<ReadyMediaPage<ReadyMediaView>> {
  const page = await listReadyMediaForOwner(input);

  return {
    ...page,
    items: page.items.map((item) =>
      createReadyMediaView(item, (variant) =>
        getAdminMediaAssetPath({
          galleryId: input.galleryId,
          mediaId: item.id,
          variant,
        }),
      ),
    ),
  };
}

export async function deleteReadyMediaForOwner({
  ownerClerkId,
  galleryId,
  photoId,
  now = new Date(),
}: {
  ownerClerkId: string;
  galleryId: string;
  photoId: string;
  now?: Date;
}): Promise<DeleteReadyMediaResult> {
  const media = await claimReadyMediaDeletionForOwner({
    ownerClerkId,
    galleryId,
    photoId,
    now,
  });

  if (!media) {
    return { outcome: "not-found" };
  }

  return deleteClaimedMedia(media, now);
}

export async function retryPendingMediaDeletionForOwner({
  ownerClerkId,
  galleryId,
  photoId,
  now = new Date(),
}: {
  ownerClerkId: string;
  galleryId: string;
  photoId: string;
  now?: Date;
}): Promise<RetryPendingMediaDeletionResult> {
  const media = await getRetryableDeletePendingMediaForOwner({
    ownerClerkId,
    galleryId,
    photoId,
    now,
  });

  if (!media) {
    return { outcome: "not-found" };
  }

  return deleteClaimedMedia(media, now);
}

async function deleteClaimedMedia(
  media: Photo,
  now: Date,
): Promise<DeleteReadyMediaResult> {
  try {
    await deleteUploadObjects(getMediaDeletionObjectKeys(media));
  } catch (error) {
    await recordMediaDeletionFailure({
      photoId: media.id,
      galleryId: media.galleryId,
      failureReason: getSafeDeletionFailureReason(error),
      now,
    });

    return { outcome: "retry-pending", media };
  }

  await deletePendingMediaRecord({
    galleryId: media.galleryId,
    photoId: media.id,
  });

  return { outcome: "deleted", media };
}

function getSafeDeletionFailureReason(error: unknown) {
  const failureType =
    error instanceof Error && error.name.trim().length > 0
      ? error.name.trim().slice(0, 80)
      : "unknown";

  return `R2 object deletion failed (${failureType}); retry scheduled.`;
}

function createReadyMediaView(
  media: ReadyMedia,
  getAssetPath: (variant: MediaAssetVariant) => string,
): ReadyMediaView {
  const originalAsset = requireResolvedAsset(media, "original");

  if (media.mediaKind === "image") {
    const displayAsset = requireResolvedAsset(media, "display");
    requireResolvedAsset(media, "thumbnail");
    const width = requireImageDimension(displayAsset.width);
    const height = requireImageDimension(displayAsset.height);

    return {
      ...getPublicReadyMedia(media),
      originalFilename: originalAsset.safeOriginalFilename,
      mediaKind: "image",
      declaredMimeType: originalAsset.originalMimeType,
      mimeType: originalAsset.responseContentType,
      originalByteSize: originalAsset.originalByteSize,
      byteSize: originalAsset.retainedByteSize,
      width,
      height,
      originalUrl: getAssetPath("original"),
      displayUrl: getAssetPath("display"),
      thumbnailUrl: getAssetPath("thumbnail"),
      downloadUrl: getAssetPath("download"),
    };
  }

  if (media.mediaKind === "video") {
    const videoAsset = requireResolvedAsset(media, "video");

    return {
      ...getPublicReadyMedia(media),
      originalFilename: originalAsset.safeOriginalFilename,
      mediaKind: "video",
      declaredMimeType: originalAsset.originalMimeType,
      mimeType: originalAsset.responseContentType,
      originalByteSize: originalAsset.originalByteSize,
      byteSize: originalAsset.retainedByteSize,
      width: null,
      height: null,
      originalUrl: getAssetPath("video"),
      displayUrl: getAssetPath(videoAsset.variant),
      thumbnailUrl: null,
      downloadUrl: getAssetPath("download"),
    };
  }

  throw new Error("Ready media is missing media kind.");
}

function getPublicReadyMedia(media: ReadyMedia) {
  return {
    id: media.id,
    galleryId: media.galleryId,
    originalFilename: media.originalFilename,
    declaredMimeType: media.declaredMimeType,
    declaredByteSize: media.declaredByteSize,
    mediaKind: media.mediaKind,
    mimeType: media.mimeType,
    byteSize: media.byteSize,
    width: media.width,
    height: media.height,
    createdAt: media.createdAt,
    readyAt: media.readyAt,
  };
}

function requireResolvedAsset(media: ReadyMedia, variant: MediaAssetVariant) {
  const asset = resolveMediaAssetVariant(media, variant);
  if (!asset) {
    throw new Error("Ready media is missing required current metadata.");
  }

  return asset;
}

function requireImageDimension(value: number | null) {
  if (value === null) {
    throw new Error("Ready media is missing required current metadata.");
  }

  return value;
}
