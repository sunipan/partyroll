import "server-only";

import sharp from "sharp";

import {
  MAX_DECODED_PIXELS,
  MAX_DISPLAY_DIMENSION,
  MAX_THUMBNAIL_DIMENSION,
} from "./rules";

const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

export type ProcessedPhoto = {
  display: Buffer;
  thumbnail: Buffer;
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
    limitInputPixels: MAX_DECODED_PIXELS,
    sequentialRead: true,
  }).metadata();

  if (
    !metadata.format ||
    !SUPPORTED_FORMATS.has(metadata.format) ||
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > MAX_DECODED_PIXELS ||
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
    .jpeg({ quality: 78, progressive: true })
    .toBuffer();

  if (!displayResult.info.width || !displayResult.info.height) {
    throw new InvalidImageError();
  }

  return {
    display: displayResult.data,
    thumbnail,
    width: displayResult.info.width,
    height: displayResult.info.height,
    totalByteSize: displayResult.data.byteLength + thumbnail.byteLength,
  };
}

function createPipeline(source: Buffer) {
  return sharp(source, {
    failOn: "error",
    limitInputPixels: MAX_DECODED_PIXELS,
    sequentialRead: true,
  }).rotate();
}

export class InvalidImageError extends Error {
  constructor() {
    super("The upload is not a supported still image.");
    this.name = "InvalidImageError";
  }
}
