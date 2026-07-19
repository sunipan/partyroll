import { z } from "zod";

import {
  MAX_SOURCE_BYTES,
  supportedImageMimeTypes,
  supportedUploadMimeTypes,
  supportedVideoMimeTypes,
  type SupportedImageMimeType,
  type SupportedUploadMimeType,
  type SupportedVideoMimeType,
} from "./client-limits";

export {
  MAX_SELECTED_UPLOADS,
  MAX_SOURCE_BYTES,
  supportedImageMimeTypes,
  supportedUploadMimeTypes,
  supportedVideoMimeTypes,
} from "./client-limits";

export const MAX_DECODED_PIXELS = 40_000_000;
export const MAX_DISPLAY_DIMENSION = 3000;
export const MAX_THUMBNAIL_DIMENSION = 720;
export const MAX_GALLERY_PHOTOS = 10_000;
export const MAX_GALLERY_STORAGE_BYTES = 100 * 1024 * 1024 * 1024;
export const UPLOAD_RESERVATION_SECONDS = 15 * 60;
export const UPLOAD_URL_SECONDS = 10 * 60;

const uploadMimeTypeSchema = z.enum(supportedUploadMimeTypes);

export const reserveUploadInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  idempotencyKey: z.uuid(),
  mimeType: uploadMimeTypeSchema,
  byteSize: z.number().int().positive().max(MAX_SOURCE_BYTES),
  originalFilename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[^\\/\0]+$/),
});

export const completeUploadInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export type ReserveUploadInput = z.infer<typeof reserveUploadInputSchema>;
export type UploadMediaKind = "image" | "video";
export type {
  SupportedImageMimeType,
  SupportedUploadMimeType,
  SupportedVideoMimeType,
};

export function getMediaKindForMimeType(
  mimeType: SupportedUploadMimeType,
): UploadMediaKind {
  return isSupportedVideoMimeType(mimeType) ? "video" : "image";
}

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
