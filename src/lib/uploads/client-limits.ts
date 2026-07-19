export const MAX_SELECTED_UPLOADS = 100;
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

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
export type SupportedUploadMimeType =
  (typeof supportedUploadMimeTypes)[number];
