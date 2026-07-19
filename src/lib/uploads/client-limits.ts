export const MAX_SELECTED_UPLOADS = 100;
export const MAX_IMAGE_SOURCE_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SOURCE_BYTES = 150 * 1024 * 1024;

export const supportedImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const supportedVideoMimeTypes = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const supportedUploadMimeTypes = [
  ...supportedImageMimeTypes,
  ...supportedVideoMimeTypes,
] as const;

export type SupportedImageMimeType = (typeof supportedImageMimeTypes)[number];
export type SupportedVideoMimeType = (typeof supportedVideoMimeTypes)[number];
export type SupportedUploadMimeType = (typeof supportedUploadMimeTypes)[number];
export type UploadMediaKind = "image" | "video";

export function getMediaKindForMimeType(
  mimeType: SupportedUploadMimeType,
): UploadMediaKind {
  return supportedVideoMimeTypes.includes(mimeType as SupportedVideoMimeType)
    ? "video"
    : "image";
}

export function getMaxSourceBytesForMediaKind(mediaKind: UploadMediaKind) {
  return mediaKind === "image"
    ? MAX_IMAGE_SOURCE_BYTES
    : MAX_VIDEO_SOURCE_BYTES;
}

export function getMaxSourceBytesForMimeType(
  mimeType: SupportedUploadMimeType,
) {
  return getMaxSourceBytesForMediaKind(getMediaKindForMimeType(mimeType));
}

export function getUploadSizeLimitMegabytes(mediaKind: UploadMediaKind) {
  return getMaxSourceBytesForMediaKind(mediaKind) / 1024 / 1024;
}
