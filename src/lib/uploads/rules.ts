import { z } from "zod";

import {
  getMaxSourceBytesForMimeType,
  getMediaKindForMimeType,
  getUploadSizeLimitMegabytes,
  supportedImageMimeTypes,
  supportedUploadMimeTypes,
  supportedVideoMimeTypes,
  type SupportedImageMimeType,
  type SupportedUploadMimeType,
  type SupportedVideoMimeType,
  type UploadMediaKind,
} from "./client-limits";

export {
  getMaxSourceBytesForMediaKind,
  getMaxSourceBytesForMimeType,
  getMediaKindForMimeType,
  getUploadSizeLimitMegabytes,
  MAX_IMAGE_SOURCE_BYTES,
  MAX_SELECTED_UPLOADS,
  MAX_VIDEO_SOURCE_BYTES,
  supportedImageMimeTypes,
  supportedUploadMimeTypes,
  supportedVideoMimeTypes,
} from "./client-limits";

export const MAX_DISPLAY_DIMENSION = 3000;
export const MAX_THUMBNAIL_DIMENSION = 640;
export const THUMBNAIL_PLACEHOLDER_DIMENSION = 16;
export const MAX_THUMBNAIL_PLACEHOLDER_DATA_URL_LENGTH = 2048;
export const MAX_GALLERY_PHOTOS = 10_000;
export const MAX_GALLERY_STORAGE_BYTES = 100 * 1024 * 1024 * 1024;
export const UPLOAD_RESERVATION_SECONDS = 15 * 60;
export const UPLOAD_URL_SECONDS = 10 * 60;

const uploadMimeTypeSchema = z.enum(supportedUploadMimeTypes);

export const photoStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "rejected",
  "deleting",
]);
export type PhotoStatus = z.infer<typeof photoStatusSchema>;

export const reserveUploadInputSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    idempotencyKey: z.uuid(),
    mimeType: uploadMimeTypeSchema,
    byteSize: z.number().int().positive(),
    originalFilename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[^\\/\0]+$/),
  })
  .superRefine((input, context) => {
    if (input.byteSize <= getMaxSourceBytesForMimeType(input.mimeType)) {
      return;
    }

    const mediaKind = getMediaKindForMimeType(input.mimeType);
    context.addIssue({
      code: "custom",
      path: ["byteSize"],
      message: `${getMediaKindLabel(mediaKind)} must be ${getUploadSizeLimitMegabytes(mediaKind)} MB or smaller.`,
    });
  });

export const completeUploadInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export type ReserveUploadInput = z.infer<typeof reserveUploadInputSchema>;
export type {
  SupportedImageMimeType,
  SupportedUploadMimeType,
  SupportedVideoMimeType,
  UploadMediaKind,
};

export function isSupportedImageMimeType(
  mimeType: string,
): mimeType is SupportedImageMimeType {
  return supportedImageMimeTypes.includes(mimeType as SupportedImageMimeType);
}

export function isSupportedVideoMimeType(
  mimeType: string,
): mimeType is SupportedVideoMimeType {
  return supportedVideoMimeTypes.includes(mimeType as SupportedVideoMimeType);
}

export function isSupportedUploadMimeType(
  mimeType: string,
): mimeType is SupportedUploadMimeType {
  return isSupportedImageMimeType(mimeType) || isSupportedVideoMimeType(mimeType);
}

function getMediaKindLabel(mediaKind: UploadMediaKind) {
  return mediaKind === "image" ? "Images" : "Videos";
}
