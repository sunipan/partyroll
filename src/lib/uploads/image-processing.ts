import "server-only";

import sharp from "sharp";

import {
  MAX_DISPLAY_DIMENSION,
  MAX_THUMBNAIL_DIMENSION,
  MAX_THUMBNAIL_PLACEHOLDER_DATA_URL_LENGTH,
  THUMBNAIL_PLACEHOLDER_DATA_URL_PREFIX,
  THUMBNAIL_PLACEHOLDER_DIMENSION,
  isValidThumbnailPlaceholderDataUrl,
} from "./rules";

const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

export type ProcessedPhoto = {
  display: Buffer;
  thumbnail: Buffer;
  thumbnailPlaceholderDataUrl: string;
  width: number;
  height: number;
  totalByteSize: number;
};

export async function processUploadedImage(
  source: Buffer,
): Promise<ProcessedPhoto> {
  try {
    return await processValidatedImage(source);
  } catch (error) {
    if (error instanceof InvalidImageError) {
      throw error;
    }
    throw new InvalidImageError();
  }
}

async function processValidatedImage(source: Buffer): Promise<ProcessedPhoto> {
  const metadata = await sharp(source, {
    failOn: "error",
    limitInputPixels: false,
    sequentialRead: true,
  }).metadata();

  if (
    !metadata.format ||
    !SUPPORTED_FORMATS.has(metadata.format) ||
    !metadata.width ||
    !metadata.height ||
    (metadata.pages ?? 1) !== 1
  ) {
    throw new InvalidImageError();
  }

  const displayResult = await createPipeline(source)
    .resize({
      width: MAX_DISPLAY_DIMENSION,
      height: MAX_DISPLAY_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 86, progressive: true })
    .toBuffer({ resolveWithObject: true });

  const thumbnail = await createPipeline(source)
    .resize({
      width: MAX_THUMBNAIL_DIMENSION,
      height: MAX_THUMBNAIL_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, progressive: true })
    .toBuffer();

  const thumbnailPlaceholder = await createPipeline(source)
    .resize({
      width: THUMBNAIL_PLACEHOLDER_DIMENSION,
      height: THUMBNAIL_PLACEHOLDER_DIMENSION,
      fit: "inside",
    })
    .blur(1)
    .jpeg({
      quality: 40,
      progressive: false,
      chromaSubsampling: "4:2:0",
      optimiseCoding: true,
    })
    .toBuffer();
  const thumbnailPlaceholderDataUrl =
    THUMBNAIL_PLACEHOLDER_DATA_URL_PREFIX +
    thumbnailPlaceholder.toString("base64");

  if (
    !displayResult.info.width ||
    !displayResult.info.height ||
    thumbnailPlaceholderDataUrl.length >
      MAX_THUMBNAIL_PLACEHOLDER_DATA_URL_LENGTH ||
    !isValidThumbnailPlaceholderDataUrl(thumbnailPlaceholderDataUrl)
  ) {
    throw new InvalidImageError();
  }

  return {
    display: displayResult.data,
    thumbnail,
    thumbnailPlaceholderDataUrl,
    width: displayResult.info.width,
    height: displayResult.info.height,
    totalByteSize: displayResult.data.byteLength + thumbnail.byteLength,
  };
}

function createPipeline(source: Buffer) {
  return sharp(source, {
    failOn: "error",
    limitInputPixels: false,
    sequentialRead: true,
  }).rotate();
}

export class InvalidImageError extends Error {
  constructor() {
    super("The upload is not a supported still image.");
    this.name = "InvalidImageError";
  }
}
