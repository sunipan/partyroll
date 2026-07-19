import "server-only";

import type { Gallery, Photo } from "@/db/schema";
import { GUEST_ACCESSIBLE_GALLERY_STATUSES } from "@/lib/galleries/rules";
import {
  isSupportedImageMimeType,
  isSupportedVideoMimeType,
} from "@/lib/uploads/rules";

export const mediaAssetVariants = [
  "thumbnail",
  "display",
  "video",
  "original",
  "download",
] as const;

export type MediaAssetVariant = (typeof mediaAssetVariants)[number];
export type MediaAssetRecord = Pick<
  Photo,
  | "id"
  | "galleryId"
  | "originalFilename"
  | "declaredMimeType"
  | "declaredByteSize"
  | "mediaKind"
  | "mimeType"
  | "byteSize"
  | "width"
  | "height"
  | "originalObjectKey"
  | "displayObjectKey"
  | "thumbnailObjectKey"
  | "createdAt"
  | "readyAt"
>;

export type ResolvedMediaAsset = {
  mediaId: string;
  galleryId: string;
  mediaKind: "image" | "video";
  variant: MediaAssetVariant;
  objectKey: string;
  responseContentType: string;
  originalFilename: string;
  safeOriginalFilename: string;
  originalMimeType: string;
  originalByteSize: number;
  retainedByteSize: number;
  width: number | null;
  height: number | null;
};

type GuestContext = {
  gallery: Gallery;
  session: { galleryId: string; accessVersion: number };
};

type GuestLookupDeps = {
  getAuthorizedGuestContext: (slug: string) => Promise<GuestContext | null>;
  getMediaAssetForGuest: (
    input: GuestMediaAssetQuery,
  ) => Promise<MediaAssetRecord | null>;
};

type AdminLookupDeps = {
  getAdminUserId: () => Promise<string | null>;
  getMediaAssetForOwner: (
    input: AdminMediaAssetQuery,
  ) => Promise<MediaAssetRecord | null>;
};

export type GuestMediaAssetQuery = {
  galleryId: string;
  slug: string;
  accessVersion: number;
  mediaId: string;
};

export type AdminMediaAssetQuery = {
  ownerClerkId: string;
  galleryId: string;
  mediaId: string;
};

export function isMediaAssetVariant(value: string): value is MediaAssetVariant {
  return mediaAssetVariants.includes(value as MediaAssetVariant);
}

export async function lookupGuestMediaAsset(
  input: { slug: string; mediaId: string; variant: MediaAssetVariant },
  deps: GuestLookupDeps = defaultGuestLookupDeps,
): Promise<ResolvedMediaAsset | null> {
  const context = await deps.getAuthorizedGuestContext(input.slug);
  if (!context) return null;

  return lookupGuestMediaAssetForSession(
    {
      galleryId: context.session.galleryId,
      slug: input.slug,
      accessVersion: context.session.accessVersion,
      mediaId: input.mediaId,
      variant: input.variant,
    },
    { getMediaAssetForGuest: deps.getMediaAssetForGuest },
  );
}

export async function lookupGuestMediaAssetForSession(
  input: GuestMediaAssetQuery & { variant: MediaAssetVariant },
  deps: Pick<GuestLookupDeps, "getMediaAssetForGuest"> = defaultGuestLookupDeps,
): Promise<ResolvedMediaAsset | null> {
  if (!hasValidMediaAssetQueryIds(input)) return null;

  const { variant, ...query } = input;
  const media = await deps.getMediaAssetForGuest(query);
  return media ? resolveMediaAssetVariant(media, variant) : null;
}

export async function lookupAdminMediaAsset(
  input: { galleryId: string; mediaId: string; variant: MediaAssetVariant },
  deps: AdminLookupDeps = defaultAdminLookupDeps,
): Promise<ResolvedMediaAsset | null> {
  const ownerClerkId = await deps.getAdminUserId();
  if (!ownerClerkId) return null;

  return lookupAdminMediaAssetForOwner(
    { ...input, ownerClerkId },
    { getMediaAssetForOwner: deps.getMediaAssetForOwner },
  );
}

export async function lookupAdminMediaAssetForOwner(
  input: AdminMediaAssetQuery & { variant: MediaAssetVariant },
  deps: Pick<AdminLookupDeps, "getMediaAssetForOwner"> = defaultAdminLookupDeps,
): Promise<ResolvedMediaAsset | null> {
  if (!hasValidMediaAssetQueryIds(input)) return null;

  const { variant, ...query } = input;
  const media = await deps.getMediaAssetForOwner(query);
  return media ? resolveMediaAssetVariant(media, variant) : null;
}

export function resolveMediaAssetVariant(
  media: MediaAssetRecord,
  variant: MediaAssetVariant,
): ResolvedMediaAsset | null {
  const common = getStrictCommonMedia(media);
  if (!common) return null;

  if (media.mediaKind === "image") {
    if (
      !isSupportedImageMimeType(common.originalMimeType) ||
      !isSupportedImageMimeType(common.finalMimeType)
    ) {
      return null;
    }
    const displayObjectKey = requireNonBlank(media.displayObjectKey);
    const thumbnailObjectKey = requireNonBlank(media.thumbnailObjectKey);
    const width = requirePositiveNumber(media.width);
    const height = requirePositiveNumber(media.height);
    if (
      !displayObjectKey ||
      !thumbnailObjectKey ||
      !width ||
      !height ||
      variant === "video"
    ) {
      return null;
    }
    return makeResolved(media, common, {
      variant,
      objectKey:
        variant === "thumbnail"
          ? thumbnailObjectKey
          : variant === "display"
            ? displayObjectKey
            : common.originalObjectKey,
      responseContentType:
        variant === "thumbnail" || variant === "display"
          ? "image/jpeg"
          : common.originalMimeType,
      width,
      height,
    });
  }

  if (media.mediaKind === "video") {
    if (
      !isSupportedVideoMimeType(common.originalMimeType) ||
      !isSupportedVideoMimeType(common.finalMimeType)
    ) {
      return null;
    }
    if (
      media.displayObjectKey !== null ||
      media.thumbnailObjectKey !== null ||
      media.width !== null ||
      media.height !== null
    ) {
      return null;
    }
    if (variant === "thumbnail" || variant === "display") {
      return null;
    }
    return makeResolved(media, common, {
      variant,
      objectKey: common.originalObjectKey,
      responseContentType: common.originalMimeType,
      width: null,
      height: null,
    });
  }

  return null;
}

export function getGuestMediaAssetPath(input: { slug: string; mediaId: string; variant: MediaAssetVariant }) {
  return `/g/${encodeURIComponent(input.slug)}/media/${encodeURIComponent(input.mediaId)}/${input.variant}`;
}

export function getAdminMediaAssetPath(input: { galleryId: string; mediaId: string; variant: MediaAssetVariant }) {
  return `/admin/galleries/${encodeURIComponent(input.galleryId)}/media/${encodeURIComponent(input.mediaId)}/${input.variant}`;
}

function getStrictCommonMedia(media: MediaAssetRecord) {
  const originalObjectKey = requireNonBlank(media.originalObjectKey);
  const originalFilename = requireNonBlank(media.originalFilename);
  const originalMimeType = requireNonBlank(media.declaredMimeType);
  const finalMimeType = requireNonBlank(media.mimeType);
  const originalByteSize = requirePositiveNumber(media.declaredByteSize);
  const retainedByteSize = requirePositiveNumber(media.byteSize);
  const safeOriginalFilename = originalFilename
    ? sanitizeOriginalFilename(originalFilename)
    : null;

  if (
    !media.readyAt ||
    !originalObjectKey ||
    !originalFilename ||
    !safeOriginalFilename ||
    !originalMimeType ||
    !finalMimeType ||
    !originalByteSize ||
    !retainedByteSize
  ) {
    return null;
  }

  return {
    originalObjectKey,
    originalFilename,
    safeOriginalFilename,
    originalMimeType,
    finalMimeType,
    originalByteSize,
    retainedByteSize,
  };
}

function makeResolved(
  media: MediaAssetRecord,
  common: NonNullable<ReturnType<typeof getStrictCommonMedia>>,
  selected: Pick<
    ResolvedMediaAsset,
    "variant" | "objectKey" | "responseContentType" | "width" | "height"
  >,
): ResolvedMediaAsset {
  return {
    mediaId: media.id,
    galleryId: media.galleryId,
    mediaKind: media.mediaKind,
    originalFilename: common.originalFilename,
    safeOriginalFilename: common.safeOriginalFilename,
    originalMimeType: common.originalMimeType,
    originalByteSize: common.originalByteSize,
    retainedByteSize: common.retainedByteSize,
    ...selected,
  };
}

function requireNonBlank(value: string | null) {
  return value && value.trim().length > 0 ? value : null;
}

function requirePositiveNumber(value: number | null) {
  return value !== null && value > 0 ? value : null;
}

function hasValidMediaAssetQueryIds(input: {
  galleryId: string;
  mediaId: string;
}) {
  return isUuid(input.galleryId) && isUuid(input.mediaId);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function sanitizeOriginalFilename(value: string) {
  const cleaned = value
    .normalize("NFC")
    .replace(/[\\/\u0000-\u001f\u007f"';`]/g, "_")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "");
  return cleaned.length > 0
    ? cleaned.slice(0, 180).replace(/[. ]+$/g, "")
    : null;
}

const defaultGuestLookupDeps: GuestLookupDeps = {
  getAuthorizedGuestContext: async (slug) =>
    (await import("@/lib/guest-access/session")).getAuthorizedGuestContext(slug),
  getMediaAssetForGuest: getMediaAssetForGuestFromDatabase,
};

const defaultAdminLookupDeps: AdminLookupDeps = {
  getAdminUserId: async () =>
    (await (await import("@clerk/nextjs/server")).auth()).userId ?? null,
  getMediaAssetForOwner: getMediaAssetForOwnerFromDatabase,
};

async function getMediaAssetForGuestFromDatabase(input: GuestMediaAssetQuery) {
  const [{ and, eq, inArray }, { db }, { galleries, photos }] = await Promise.all([
    import("drizzle-orm"),
    import("@/db"),
    import("@/db/schema"),
  ]);
  const [media] = await db
    .select(mediaAssetColumns(photos))
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(
      and(
        eq(photos.id, input.mediaId),
        eq(photos.galleryId, input.galleryId),
        eq(photos.status, "ready"),
        eq(galleries.id, input.galleryId),
        eq(galleries.slug, input.slug),
        eq(galleries.accessVersion, input.accessVersion),
        inArray(galleries.status, [...GUEST_ACCESSIBLE_GALLERY_STATUSES]),
      ),
    )
    .limit(1);
  return media ?? null;
}

async function getMediaAssetForOwnerFromDatabase(input: AdminMediaAssetQuery) {
  const [{ and, eq, inArray }, { db }, { galleries, photos }] = await Promise.all([
    import("drizzle-orm"),
    import("@/db"),
    import("@/db/schema"),
  ]);
  const [media] = await db
    .select(mediaAssetColumns(photos))
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(
      and(
        eq(photos.id, input.mediaId),
        eq(photos.galleryId, input.galleryId),
        eq(photos.status, "ready"),
        eq(galleries.id, input.galleryId),
        eq(galleries.ownerClerkId, input.ownerClerkId),
        inArray(galleries.status, ["open", "closed", "archived"]),
      ),
    )
    .limit(1);
  return media ?? null;
}

function mediaAssetColumns(photos: typeof import("@/db/schema")["photos"]) {
  return {
    id: photos.id,
    galleryId: photos.galleryId,
    originalFilename: photos.originalFilename,
    declaredMimeType: photos.declaredMimeType,
    declaredByteSize: photos.declaredByteSize,
    mediaKind: photos.mediaKind,
    mimeType: photos.mimeType,
    byteSize: photos.byteSize,
    width: photos.width,
    height: photos.height,
    originalObjectKey: photos.originalObjectKey,
    displayObjectKey: photos.displayObjectKey,
    thumbnailObjectKey: photos.thumbnailObjectKey,
    createdAt: photos.createdAt,
    readyAt: photos.readyAt,
  };
}
